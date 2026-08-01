import anthropic
import copy
import json
from pydantic import BaseModel, ValidationError
from typing import Dict, Any, List, Callable, Optional

client = anthropic.Anthropic()

#                   ┌─────────────────────────────────┐
#                   │        Sub-Agent Task           │
#                   └────────────────┬────────────────┘
#                                    │
#                                    ▼
# ┌─────────────────────────────────────────────────────────────────────┐
# │ Tier 1: Local Retry Loop (Exponential Backoff + Jitter)             │
# │ (Handles transient API, network, or rate-limit failures)            │
# └──────────────────────────────────┬──────────────────────────────────┘
#                                    │ (If unrecoverable)
#                                    ▼
# ┌─────────────────────────────────────────────────────────────────────┐
# │ Tier 2: Self-Correction Loop (Evaluator / Schema Fixer)             │
# │ (Handles invalid output formats, missing fields, or code errors)    │
# └──────────────────────────────────┬──────────────────────────────────┘
#                                    │ (If validation continuously fails)
#                                    ▼
# ┌─────────────────────────────────────────────────────────────────────┐
# │ Tier 3: Saga Rollback Pattern (Compensating Actions)                │
# │ (Reverts committed external state & restores checkpointed state)    │
# └──────────────────────────────────┬──────────────────────────────────┘
#                                    │ (If system state cannot be recovered)
#                                    ▼
# ┌─────────────────────────────────────────────────────────────────────┐
# │ Tier 4: Human-in-the-Loop Escalation & Quarantine                   │
# │ (Pauses execution, logs trace context, alerts human supervisor)     │
# └─────────────────────────────────────────────────────────────────────┘

# --- 1. Schemas & State Management ---

class CodeTaskOutput(BaseModel):
    file_path: str
    code: str
    unit_tests: str

class WorkflowState(BaseModel):
    project_id: str
    committed_files: Dict[str, str] = {}
    history_log: List[str] = []

class ExecutionCheckpoint:
    def __init__(self, state: WorkflowState):
        # Deep copy ensures complete isolation from in-flight mutations
        self.snapshot: WorkflowState = copy.deepcopy(state)
        self.compensating_actions: List[Callable[[], None]] = []

    def add_compensation(self, action: Callable[[], None]):
        self.compensating_actions.append(action)

    def rollback(self) -> WorkflowState:
        """Executes all compensating actions in LIFO order and returns clean state."""
        for action in reversed(self.compensating_actions):
            try:
                action()
            except Exception as e:
                print(f"[Rollback Warning] Compensating action failed: {e}")
        return self.snapshot

# --- 2. Sub-Agent Execution with Tier 2 Self-Correction ---

def run_coder_agent_with_self_correction(prompt: str, max_attempts: int = 3) -> CodeTaskOutput:
    """Executes a code-generation agent with structured JSON validation and self-correction."""
    system_prompt = (
        "You are an expert Python engineer. Output your response STRICTLY as a JSON object matching this schema:\n"
        "{\n"
        '  "file_path": "string",\n'
        '  "code": "string",\n'
        '  "unit_tests": "string"\n'
        "}\n"
        "Do not include markdown code blocks or surrounding commentary."
    )
    
    messages = [{"role": "user", "content": prompt}]

    for attempt in range(1, max_attempts + 1):
        response = client.messages.create(
            model="claude-3-7-sonnet-20250219",
            max_tokens=1500,
            system=system_prompt,
            messages=messages
        )
        raw_text = response.content[0].text.strip()

        try:
            # Validate output against strict Pydantic model
            data = json.loads(raw_text)
            validated_output = CodeTaskOutput(**data)
            return validated_output

        except (json.JSONDecodeError, ValidationError) as err:
            print(f"  [Attempt {attempt}/{max_attempts}] Validation failed: {err}")
            if attempt == max_attempts:
                raise RuntimeError(f"Sub-agent failed format validation after {max_attempts} attempts. Error: {err}")
            
            # Feed validation error back to agent context for Tier 2 correction
            messages.append({"role": "assistant", "content": raw_text})
            messages.append({
                "role": "user", 
                "content": f"Your output was invalid. Validation error: {err}. Please output valid JSON only."
            })

# --- 3. Orchestrator with Saga Pattern Rollback ---

class WorkflowOrchestrator:
    def __init__(self, state: WorkflowState):
        self.state = state

    def execute_subagent_step(
        self, 
        step_name: str, 
        agent_fn: Callable[[], CodeTaskOutput], 
        compensation_fn: Optional[Callable[[CodeTaskOutput], None]] = None
    ) -> bool:
        print(f"\n---> Starting Step: {step_name}")
        # Take an isolated snapshot before running the step
        checkpoint = ExecutionCheckpoint(self.state)

        try:
            # Execute sub-agent (handles local retries/self-correction internally)
            result: CodeTaskOutput = agent_fn()

            # Register compensating action if an external change occurs
            if compensation_fn:
                checkpoint.add_compensation(lambda: compensation_fn(result))

            # Atomic Commit: Update state only after complete validation
            self.state.committed_files[result.file_path] = result.code
            self.state.history_log.append(f"Successfully completed {step_name}")
            print(f"[Success] {step_name} committed to state.")
            return True

        except Exception as e:
            print(f"[CRITICAL ERROR] {step_name} failed: {e}")
            print(f"[ROLLBACK] Reverting state to pre-{step_name} checkpoint...")
            
            # Rollback: Revert state and run compensating tasks
            self.state = checkpoint.rollback()
            self.state.history_log.append(f"FAILED {step_name}: State rolled back.")
            return False

# --- 4. Example Usage ---

# External system mock (e.g., remote git repository or database)
remote_disk = {}

def create_remote_file_mock(output: CodeTaskOutput):
    print(f"  [External System] Writing file to remote disk: {output.file_path}")
    remote_disk[output.file_path] = output.code

def delete_remote_file_mock(output: CodeTaskOutput):
    print(f"  [Compensating Action] Deleting remote file: {output.file_path}")
    remote_disk.pop(output.file_path, None)

# Execution
initial_state = WorkflowState(project_id="proj_882")
orchestrator = WorkflowOrchestrator(initial_state)

# Step 1: Successful agent step
def task1():
    out = run_coder_agent_with_self_correction("Create a python helper utility in utils.py that calculates fibonacci numbers.")
    create_remote_file_mock(out)
    return out

orchestrator.execute_subagent_step(
    step_name="Generate Utils", 
    agent_fn=task1,
    compensation_fn=delete_remote_file_mock
)

# Step 2: Simulated failing step (e.g., bad agent prompt causes invalid schema/runtime error)
def task2_failing():
    # Intentionally bad prompt that returns non-JSON text to trigger failure
    raise RuntimeError("API Timeout / Unrecoverable Agent Parsing Failure")

orchestrator.execute_subagent_step(
    step_name="Generate Auth Module", 
    agent_fn=task2_failing
)

print("\n=== Final System Audit ===")
print("Committed Files in State:", list(orchestrator.state.committed_files.keys()))
print("Workflow Log:", orchestrator.state.history_log)