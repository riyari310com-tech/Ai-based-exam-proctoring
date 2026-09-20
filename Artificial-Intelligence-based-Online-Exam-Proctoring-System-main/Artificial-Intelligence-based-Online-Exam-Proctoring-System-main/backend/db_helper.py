import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'quizo.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sign_up (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def get_all_details():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sign_up")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
    conn.close()
    return rows

def insert_signup(email, username, password):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO sign_up (email, username, password) VALUES (?, ?, ?)",
            (email, username, password)
        )
        conn.commit()
        cursor.close()
        print("Sign-Up data credentials inserted successfully!")
        return 1
    except sqlite3.IntegrityError:
        print("Error: Email already exists.")
        return -1
    except Exception as e:
        print(f"An error occurred: {e}")
        return -1

def search_login_credentials(email, password):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT email, password FROM sign_up WHERE email=? AND password=?",
        (email, password)
    )
    rows = cursor.fetchall()
    conn.close()
    if rows:
        print("Data found")
        return True
    else:
        print("No data found.")
    return False


if __name__ == "__main__":
    get_all_details()
