import anthropic
import copy
import json
from enum import Enum
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional, Callable

client = anthropic.Anthropic()

#                        ┌─────────────────────────┐
#                        │  Sub-Agent Task Output  │
#                        └────────────┬────────────┘
#                                     │
#                                     ▼
#                        ┌─────────────────────────┐
#                        │   Confidence Evaluator  │
#                        └────────────┬────────────┘
#                                     │
#                   ┌─────────────────┴─────────────────┐
#                   │ Confidence >= Threshold (0.85)    │ Confidence < Threshold
#                   ▼                                   ▼
#       ┌───────────────────────┐           ┌───────────────────────┐
#       │  Commit State Snapshot│           │  Quarantine Checkpoint│
#       └───────────────────────┘           └───────────┬───────────┘
#                                                       │
#                                                       ▼
#                                           ┌───────────────────────┐
#                                           │   HITL Approval Gate  │
#                                           │   (Paused Workflow)   │
#                                           └───────────┬───────────┘
#                                                       │
#                  ┌────────────────────────────────────┼────────────────────────────────────┐
#                  │                                    │                                    │
#                  ▼                                    ▼                                    ▼
#        [Path A: Human Override]             [Path B: Guided Retry]               [Path C: Human Reject]
#                  │                                    │                                    │
#                  ▼                                    ▼                                    ▼
#      Merge Manual Fix into State         Re-run Sub-agent with Human Context     Execute LIFO Saga Rollback

# --- 1. Schemas & State ---

class ActionConfidence(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class SubAgentResult(BaseModel):
    task_id: str
    output_payload: Dict[str, Any]
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    reasoning: str

class HumanDecision(str, Enum):
    APPROVE = "APPROVE"          # Accept draft (or human-modified draft)
    RETRY = "RETRY"              # Re-run agent with human guidance
    REJECT_ROLLBACK = "REJECT"  # Reject draft and trigger saga rollback

class HumanReviewPayload(BaseModel):
    decision: HumanDecision
    corrected_payload: Optional[Dict[str, Any]] = None
    guidance_instructions: Optional[str] = None

class WorkflowState(BaseModel):
    workflow_id: str
    committed_data: Dict[str, Any] = {}
    history: List[str] = []

# --- 2. State Checkpoint & Saga Compensation ---

class HITLCheckpoint:
    def __init__(self, state: WorkflowState):
        self.snapshot: WorkflowState = copy.deepcopy(state)
        self.compensating_actions: List[Callable[[], None]] = []

    def add_compensation(self, action: Callable[[], None]):
        self.compensating_actions.append(action)

    def rollback(self) -> WorkflowState:
        for action in reversed(self.compensating_actions):
            try:
                action()
            except Exception as e:
                print(f"[Rollback Warning] Compensation failed: {e}")
        return self.snapshot

# --- 3. Sub-Agent Execution with Self-Confidence Scoring ---

def run_analysis_subagent(prompt: str) -> SubAgentResult:
    """Executes a sub-agent that self-evaluates its confidence level."""
    system_prompt = (
        "You are a Risk Assessment Agent. Analyze the request and provide your response as JSON matching this schema:\n"
        "{\n"
        '  "task_id": "string",\n'
        '  "output_payload": {"risk_level": "LOW/MED/HIGH", "action_item": "string"},\n'
        '  "confidence_score": float (0.0 to 1.0),\n'
        '  "reasoning": "string"\n'
        "}\n"
        "Output RAW JSON only."
    )

    res = client.messages.create(
        model="claude-3-7-sonnet-20250219",
        max_tokens=1000,
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}]
    )
    
    data = json.loads(res.content[0].text.strip())
    return SubAgentResult(**data)

# --- 4. HITL Orchestrator ---

class HITLOrchestrator:
    def __init__(self, state: WorkflowState, confidence_threshold: float = 0.80):
        self.state = state
        self.confidence_threshold = confidence_threshold

    def execute_step_with_hitl(
        self,
        step_name: str,
        prompt: str,
        compensation_fn: Optional[Callable[[Dict[str, Any]], None]] = None,
        human_review_channel: Optional[Callable[[SubAgentResult], HumanReviewPayload]] = None
    ) -> bool:
        print(f"\n---> Running Step: {step_name}")
        checkpoint = HITLCheckpoint(self.state)

        # Step A: Run Sub-Agent
        result = run_analysis_subagent(prompt)
        print(f"[Agent Evaluation] Confidence: {result.confidence_score} (Threshold: {self.confidence_threshold})")

        # Register rollback action if external state is mutated
        if compensation_fn:
            checkpoint.add_compensation(lambda: compensation_fn(result.output_payload))

        # Step B: High Confidence Gate -> Direct Commit
        if result.confidence_score >= self.confidence_threshold:
            self._commit(step_name, result.output_payload)
            return True

        # Step C: Low Confidence Gate -> Quarantined HITL Pause
        print(f"[HITL GATE TRIGGERED] Confidence too low ({result.confidence_score}). Quarantining state...")
        self.state.history.append(f"{step_name}: Quarantined due to low confidence ({result.confidence_score}).")

        if not human_review_channel:
            print("[CRITICAL] No human review channel configured. Executing automatic rollback.")
            self.state = checkpoint.rollback()
            return False

        # Suspend & Wait for Human Input (Simulated Sync Hook)
        review_result: HumanReviewPayload = human_review_channel(result)

        # Step D: Process Human Decision
        if review_result.decision == HumanDecision.APPROVE:
            payload_to_commit = review_result.corrected_payload or result.output_payload
            print("[HITL Override] Human APPROVED task execution.")
            self.state.history.append(f"{step_name}: Approved by Human Operator.")
            self._commit(step_name, payload_to_commit)
            return True

        elif review_result.decision == HumanDecision.RETRY:
            print(f"[HITL Retry] Re-running agent with human context: '{review_result.guidance_instructions}'")
            self.state.history.append(f"{step_name}: Human requested retry with guidance.")
            
            # Recursive retry with augmented guidance
            guided_prompt = f"{prompt}\n\nHuman Supervisor Guidance: {review_result.guidance_instructions}"
            return self.execute_step_with_hitl(step_name, guided_prompt, compensation_fn, human_review_channel)

        else:  # REJECT_ROLLBACK
            print("[HITL Reject] Human REJECTED task execution. Initiating Saga Rollback...")
            self.state = checkpoint.rollback()
            self.state.history.append(f"{step_name}: Rejected by Human. State rolled back.")
            return False

    def _commit(self, step_name: str, payload: Dict[str, Any]):
        self.state.committed_data[step_name] = payload
        self.state.history.append(f"{step_name}: Committed successfully.")
        print(f"[State Commit] Updated state with payload from {step_name}.")

# --- 5. Mock Human Interface & Example Run ---

def mock_slack_hitl_channel(agent_result: SubAgentResult) -> HumanReviewPayload:
    """Simulates a human supervisor inspecting the output via Slack/UI and making a choice."""
    print("\n--- [HUMAN OPERATOR DASHBOARD] ---")
    print(f"Task Reasoning: {agent_result.reasoning}")
    print(f"Proposed Output: {agent_result.output_payload}")
    print("Select Action: [1] Approve with fix, [2] Retry with instructions, [3] Reject & Roll back")

    # Mocking choice 1: Human approves with an overridden payload
    return HumanReviewPayload(
        decision=HumanDecision.APPROVE,
        corrected_payload={"risk_level": "LOW", "action_item": "Proceed with standard verification (Human Verified)"}
    )

# Execution
state = WorkflowState(workflow_id="wf_hitl_001")
orchestrator = HITLOrchestrator(state, confidence_threshold=0.85)

success = orchestrator.execute_step_with_hitl(
    step_name="Account Deletion Risk Assessment",
    prompt="Assess risk of deleting inactive account ID 99401 with $0 balance.",
    human_review_channel=mock_slack_hitl_channel
)

print("\n=== Final Audit Trail ===")
print("Committed Data:", json.dumps(orchestrator.state.committed_data, indent=2))
print("Execution History:", orchestrator.state.history)