import anthropic
import json
from dataclasses import dataclass, field
from typing import Dict, Any, List

client = anthropic.Anthropic()

# 1. External State Store (Decoupled from LLM context)
@dataclass
class WorkflowState:
    workflow_id: str
    original_goal: str
    artifacts: Dict[str, Any] = field(default_factory=dict)
    execution_log: List[Dict[str, Any]] = field(default_factory=list)

    def update_artifact(self, key: str, value: Any, agent_name: str):
        self.artifacts[key] = value
        self.execution_log.append({
            "agent": agent_name,
            "action": f"Updated {key}",
            "summary": str(value)[:200]  # Truncated summary for light logging
        })

# 2. Context Builder (Generates minimal prompt payloads)
class ContextBuilder:
    @staticmethod
    def build_researcher_context(state: WorkflowState) -> str:
        # Pass ONLY the original goal to the researcher
        return f"Primary Research Goal: {state.original_goal}"

    @staticmethod
    def build_coder_context(state: WorkflowState) -> str:
        # Pass ONLY the research findings, not the conversational back-and-forth
        research_data = state.artifacts.get("research_summary", "No research found.")
        return (
            f"Goal: {state.original_goal}\n\n"
            f"Architectural Specs (from Research Agent):\n{research_data}"
        )

# 3. Sub-Agent Execution (Stateless context window)
def run_subagent(system_prompt: str, scoped_context: str, model="claude-3-5-haiku-20241022") -> str:
    """Executes a sub-agent with a fresh, isolated context window."""
    response = client.messages.create(
        model=model,
        max_tokens=1500,
        system=system_prompt,
        messages=[{"role": "user", "content": scoped_context}]
    )
    return response.content[0].text

# 4. Workflow Orchestration
def execute_workflow():
    state = WorkflowState(
        workflow_id="wf_101",
        original_goal="Build a rate-limited API gateway in Python"
    )

    # Step A: Researcher Agent
    researcher_context = ContextBuilder.build_researcher_context(state)
    research_output = run_subagent(
        system_prompt="You are a Technical Researcher. Provide 3 key bullet points on architectural recommendations.",
        scoped_context=researcher_context
    )
    state.update_artifact("research_summary", research_output, agent_name="ResearcherAgent")

    # Step B: Coder Agent (Receives compressed state, zero historical chat tokens)
    coder_context = ContextBuilder.build_coder_context(state)
    code_output = run_subagent(
        system_prompt="You are a Senior Python Developer. Write a minimal, clean implementation based on specs.",
        scoped_context=coder_context,
        model="claude-3-7-sonnet-20250219"
    )
    state.update_artifact("code_draft", code_output, agent_name="CoderAgent")

    print(f"Workflow Complete. Total artifacts stored: {len(state.artifacts)}")
    print("\nFinal Code Output:\n", state.artifacts["code_draft"])

execute_workflow()