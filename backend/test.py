from google import genai
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Get API key
api_key = os.getenv("GEMINI_API_KEY")

print("🔑 API KEY LOADED:", "YES" if api_key else "NO")

if not api_key:
    raise ValueError("❌ GEMINI_API_KEY not found. Check your .env file.")

# Initialize client
client = genai.Client(api_key=api_key)

# Test prompt
prompt = "Say hello in one short, friendly sentence."

try:
    response = client.models.generate_content(
        model="models/gemini-2.5-flash",  # ✅ confirmed working
        contents=prompt
    )

    print("\n✅ GEMINI RESPONSE:")
    print(response.text)

except Exception as e:
    print("\n❌ ERROR:")
    print(e)