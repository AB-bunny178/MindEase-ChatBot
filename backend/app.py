# app.py (Updated for Gemini + mental-health focus)
#$env:GEMINI_API_KEY="AIzaSyARyBctw7DSDfBJ97g5Iw7FiBh9zQ03u_M"
# app.py (Render deployment ready)

from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from datetime import datetime
import os
import google.generativeai as genai
from textblob import TextBlob

# ------------------- Flask App -------------------
app = Flask(__name__)
CORS(app, origins=["*"])     # you can restrict later

DB_PATH = 'mindease.db'

# Configure Gemini API key (Render injects this)
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_KEY)

# ------------------- DB Setup -------------------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT,
            message TEXT,
            mood REAL,
            timestamp TEXT
        )
    ''')
    conn.commit()
    conn.close()

def save_message(role, message, mood=None):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'INSERT INTO chats (role, message, mood, timestamp) VALUES (?, ?, ?, ?)',
        (role, message, mood, datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()

# ------------------- Mood Analysis -------------------
def analyze_mood(text):
    blob = TextBlob(text)
    polarity = round(blob.sentiment.polarity, 3)  # -1 to 1
    mood_score = int((polarity + 1) * 50)         # 0 to 100
    return polarity, mood_score

# ------------------- Gemini Response -------------------
def generate_response_gemini(user_text, mood_score):

    if not GEMINI_KEY:
        return "❌ Server missing Gemini API key."

    prompt = f"""
You are a compassionate therapist bot.
You ONLY respond to mental health, emotional, or wellbeing issues.
User mood score: {mood_score}.
Respond empathetically to: '{user_text}'.
If the user asks unrelated questions, gently guide them back to mental-health topics.
"""

    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print("Gemini Error:", e)
        return "❌ Unable to generate response. Please try again."

# ------------------- Routes -------------------
@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')

    if not user_message:
        return jsonify({'error': 'no message provided'}), 400

    # Sentiment / mood
    polarity, mood_score = analyze_mood(user_message)
    save_message("user", user_message, mood_score)

    # AI response
    bot_reply = generate_response_gemini(user_message, mood_score)
    save_message("bot", bot_reply, mood_score)

    return jsonify({
        "reply": bot_reply,
        "mood": mood_score,
        "polarity": polarity
    })

@app.route('/moods', methods=['GET'])
def moods():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, role, message, mood, timestamp FROM chats ORDER BY id DESC LIMIT 50')
    rows = c.fetchall()
    conn.close()

    items = [
        {"id": r[0], "role": r[1], "message": r[2], "mood": r[3], "timestamp": r[4]}
        for r in rows
    ]
    return jsonify({"items": items})

# ------------------- Start App (Render) -------------------
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get("PORT", 5000))   # Render uses PORT variable
    app.run(host='0.0.0.0', port=port, debug=False)
