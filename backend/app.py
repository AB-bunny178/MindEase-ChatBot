# app.py (Updated for Gemini + mental-health focus)
#$env:GEMINI_API_KEY="AIzaSyARyBctw7DSDfBJ97g5Iw7FiBh9zQ03u_M"
from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from datetime import datetime
import random
import os
import google.generativeai as genai

app = Flask(__name__)
CORS(app)
DB_PATH = 'mindease.db'

# Configure Gemini API key
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# ------------------- DB helpers -------------------
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
    c.execute('INSERT INTO chats (role, message, mood, timestamp) VALUES (?, ?, ?, ?)',
              (role, message, mood, datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()

# ------------------- Sentiment / mood -------------------
from textblob import TextBlob

def analyze_mood(text):
    blob = TextBlob(text)
    polarity = round(blob.sentiment.polarity, 3)  # -1 to 1
    mood_score = int((polarity + 1) * 50)
    return polarity, mood_score

# ------------------- Generate Gemini-based mental health response -------------------
def generate_response_gemini(user_text, mood_score):
    """
    Uses Gemini AI to generate mental-health-only responses.
    """
    prompt = f"""
You are a compassionate therapist bot.
You ONLY respond to mental health, emotional, or wellbeing issues.
User mood score: {mood_score}.
Respond empathetically to: '{user_text}'
If the user asks unrelated questions, gently redirect them to mental health topics.
"""
    model = genai.GenerativeModel('gemini-2.5-flash')
    response = model.generate_content(prompt)
    return response.text.strip()

# ------------------- Routes -------------------
@app.route('/init', methods=['POST'])
def route_init():
    init_db()
    return jsonify({'ok': True, 'msg': 'DB initialized'})

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    use_voice = data.get('voice', False)  # True if spoken input, False if typed

    if not user_message:
        return jsonify({'error': 'no message provided'}), 400

    # Analyze sentiment / mood
    polarity, mood_score = analyze_mood(user_message)
    save_message('user', user_message, mood_score)

    # Generate mental-health-focused response using Gemini
    bot_reply = generate_response_gemini(user_message, mood_score)
    save_message('bot', bot_reply, mood_score)

    # Return reply, mood, and polarity
    return jsonify({
        'reply': bot_reply,
        'mood': mood_score,
        'polarity': polarity
    })

@app.route('/moods', methods=['GET'])
def moods():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id, role, message, mood, timestamp FROM chats ORDER BY id DESC LIMIT 50')
    rows = c.fetchall()
    conn.close()
    items = [dict(id=r[0], role=r[1], message=r[2], mood=r[3], timestamp=r[4]) for r in rows]
    return jsonify({'items': items})

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)
