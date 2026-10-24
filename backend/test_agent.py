
import os
from dotenv import load_dotenv
from cortex_agent_sdk import CortexAgentClient

load_dotenv()

client = CortexAgentClient(
    account=os.environ["SNOWFLAKE_ACCOUNT"],
    auth=os.environ["SNOWFLAKE_PAT"]
)

agent = {
    "type": "data",
    "spec": {
        "database": os.environ["SNOWFLAKE_AGENT_DATABASE"],
        "schema": os.environ["SNOWFLAKE_AGENT_SCHEMA"],
        "name": os.environ["SNOWFLAKE_AGENT_NAME"]
    }
}

conversation = client.conversations.create(
    origin_application="blockboost",
    agent=agent
)

turn = conversation.send(
    "Which business categories have the highest reported closure rates?"
)

response = turn.result()

print("Agent response:")
print(response.text)
print("Conversation ID:", conversation.id)
