import os
import requests

# If running outside VS Code's injected terminal, optionally load .env using python-dotenv
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

url = "https://api.openai.com/v1/chat/completions"
api_key = os.getenv("OPEN_AI_API")

if not api_key:
    print("Warning: OPEN_AI_API not set in environment")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

data = {
    "model": "gpt-4o-mini",
    "messages": [
        {"role": "system", "content": "You are helpful assistant."},
        {
            "role": "user",
            "content": "What do you think is the most important in our lives",
        },
    ],
    "temperature": 0.7,
}

try:
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    reply = response.json()
    print(reply)
    print(". . . . . . .")
    print(". . . . . . .")
    print(". . . . . . .")
    print(reply["choices"][0]["message"]["content"])

except requests.exceptions.HTTPError as http_error:
    print(f"ERROR: {http_error}")
except Exception as e:
    print(f"error {e}")