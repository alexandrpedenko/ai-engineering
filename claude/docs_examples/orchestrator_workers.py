import anthropic
import json
import asyncio

client = anthropic.Anthropic()

#                   ┌─────────────────┐
#                   │   User Request  │
#                   └────────┬────────┘
#                            ▼
#                  ┌───────────────────┐
#                  │   Orchestrator    │
#                  │ Task Decomposition│
#                  └─┬───────┬───────┬─┘
#                    │       │       │
#         ┌──────────┘       │       └──────────┐
#         ▼                  ▼                  ▼
# ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
# │  Worker A    │   │  Worker B    │   │  Worker C    │
# │ (Sub-task 1) │   │ (Sub-task 2) │   │ (Sub-task 3) │
# └───────┬──────┘   └───────┬──────┘   └───────┬──────┘
#         │                  │                  │
#         └──────────┐       │       ┌──────────┘
#                    ▼       ▼       ▼
#                  ┌───────────────────┐
#                  │   Orchestrator    │
#                  │   (Aggregation)   │
#                  └─────────┬─────────┘
#                            ▼
#                     Final Output

# Define Orchestrator Tool for task decomposition
ORCHESTRATOR_TOOLS = [
    {
        "name": "assign_tasks",
        "description": "Decompose a main task into parallel sub-tasks for specialized worker agents.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tasks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "task_id": {"type": "string"},
                            "worker_type": {"type": "string", "enum": ["researcher", "coder", "editor"]},
                            "instruction": {"type": "string"}
                        },
                        "required": ["task_id", "worker_type", "instruction"]
                    }
                }
            },
            "required": ["tasks"]
        }
    }
]

async def run_worker(worker_type: str, instruction: str) -> str:
    """Executes a specialized sub-task with a targeted system prompt."""
    system_prompts = {
        "researcher": "You are a research specialist. Provide factual, concise analytical findings.",
        "coder": "You are a senior software engineer. Write clean, modular Python code.",
        "editor": "You are a technical editor. Refine tone, clarity, and logical flow."
    }
    
    response = client.messages.create(
        model="claude-3-7-sonnet-20250219",
        max_tokens=1000,
        system=system_prompts.get(worker_type, "You are a helpful AI assistant."),
        messages=[{"role": "user", "content": instruction}]
    )
    return response.content[0].text

async def orchestrator_workflow(user_request: str):
    # Step 1: Orchestrator decomposes task
    orchestrator_res = client.messages.create(
        model="claude-3-7-sonnet-20250219",
        max_tokens=1500,
        system="Analyze the user request and break it down into specialized worker sub-tasks using the assign_tasks tool.",
        messages=[{"role": "user", "content": user_request}],
        tools=ORCHESTRATOR_TOOLS,
        tool_choice={"type": "tool", "name": "assign_tasks"}
    )
    
    # Extract tool call
    tool_use = next(block for block in orchestrator_res.content if block.type == "tool_use")
    tasks = tool_use.input["tasks"]
    
    print(f"[Orchestrator] Created {len(tasks)} sub-tasks.")

    # Step 2: Execute Worker tasks concurrently
    worker_promises = [run_worker(task["worker_type"], task["instruction"]) for task in tasks]
    worker_results = await asyncio.gather(*worker_promises)

    # Compile findings for aggregation
    aggregated_input = "\n\n".join([
        f"--- Task ID {t['task_id']} ({t['worker_type']}) Output ---\n{res}"
        for t, res in zip(tasks, worker_results)
    ])

    # Step 3: Orchestrator synthesizes final result
    final_res = client.messages.create(
        model="claude-3-7-sonnet-20250219",
        max_tokens=2000,
        system="You are the lead architect. Synthesize the outputs from your workers into a single coherent solution.",
        messages=[
            {"role": "user", "content": f"Original Request: {user_request}\n\nWorker Results:\n{aggregated_input}"}
        ]
    )
    
    return final_res.content[0].text