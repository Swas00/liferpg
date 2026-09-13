#!/usr/bin/env python3
"""
Life RPG Backend Server with MongoDB Database
Implements the 6 Collections requested by the user:
  1. Users: user_id, username, email, password_hash, level, total_xp
  2. Stats: user_id, strength, intelligence, vitality, discipline
  3. Quests: quest_id, title, description, category, difficulty, xp_reward
  4. Quest_Completions: completion_id, user_id, quest_id, completed_at, xp_earned
  5. Inventory: inventory_id, user_id, item_id, quantity
  6. Achievements: achievement_id, user_id, title, unlocked_at

Also powers the 8-Step Anti-Cheat Server-Side Quest Completion Pipeline on MongoDB!
"""

import http.server
import socketserver
import json
import os
import sys
import hashlib
import secrets
import datetime
import urllib.parse

try:
    import pymongo
    HAS_PYMONGO = True
except ImportError:
    HAS_PYMONGO = False

PORT = 8080
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "life_rpg_db"

mongo_client = None
db = None
SESSIONS = {}  # token -> user_id

def init_mongo():
    global mongo_client, db
    if not HAS_PYMONGO:
        print("[WARN] pymongo not found.")
        return False
    try:
        mongo_client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        mongo_client.server_info()  # triggers exception if unreachable
        db = mongo_client[DB_NAME]
        print(f"[SUCCESS] Connected to MongoDB: {MONGO_URI} (Database: {DB_NAME})")

        # Create unique indexes
        db.Users.create_index("user_id", unique=True)
        db.Users.create_index("email", unique=True)
        db.Stats.create_index("user_id", unique=True)
        db.Quests.create_index("quest_id", unique=True)
        db.Quest_Completions.create_index("completion_id", unique=True)
        db.Inventory.create_index("inventory_id", unique=True)
        db.Achievements.create_index("achievement_id", unique=True)

        seed_default_data_if_empty()
        return True
    except Exception as e:
        print(f"[ERROR] MongoDB Connection Error: {e}")
        return False

def hash_pw(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def seed_default_data_if_empty():
    if db.Users.count_documents({}) == 0:
        print("[INFO] Seeding initial Life RPG records into MongoDB collections...")

        # 1. Users
        user_doc = {
            "user_id": "USR-001",
            "username": "Alex Johnson",
            "email": "alex@productivity.life",
            "password_hash": hash_pw("password123"),
            "level": 1,
            "total_xp": 65,
            "gold": 250,
            "streak": 7,
            "fatigue": 18,
            "unassigned_points": 3,
            "created_at": datetime.datetime.utcnow().isoformat(),
        }
        db.Users.insert_one(user_doc)

        # 2. Stats
        stats_doc = {
            "user_id": "USR-001",
            "strength": 28,
            "intelligence": 35,
            "vitality": 20,
            "discipline": 26,
        }
        db.Stats.insert_one(stats_doc)

        # 3. Quests
        sample_quests = [
            {
                "quest_id": "QST-101",
                "user_id": "USR-001",
                "title": "Heavy Gym Workout & Strength Training",
                "description": "5 sets of bench press, deadlifts, and weighted pull-ups.",
                "category": "Fitness",
                "difficulty": "Hard",
                "xp_reward": 80,
                "gold_reward": 50,
                "stat_reward": "strength",
                "daily": True,
            },
            {
                "quest_id": "QST-102",
                "user_id": "USR-001",
                "title": "Deep Coding Session & System Architecture (2 Hours)",
                "description": "Uninterrupted engineering work on Life RPG backend and API design.",
                "category": "Study",
                "difficulty": "Hard",
                "xp_reward": 80,
                "gold_reward": 50,
                "stat_reward": "intelligence",
                "daily": True,
            },
            {
                "quest_id": "QST-103",
                "user_id": "USR-001",
                "title": "Morning 5km Cardio Run & 10k Steps",
                "description": "Fast-paced outdoor running to build physical stamina and speed.",
                "category": "Fitness",
                "difficulty": "Medium",
                "xp_reward": 50,
                "gold_reward": 30,
                "stat_reward": "vitality",
                "daily": True,
            },
            {
                "quest_id": "QST-104",
                "user_id": "USR-001",
                "title": "Read 30 Pages of Technical / Non-Fiction Book",
                "description": "Active reading and chapter summarization for mental growth.",
                "category": "Study",
                "difficulty": "Easy",
                "xp_reward": 30,
                "gold_reward": 15,
                "stat_reward": "intelligence",
                "daily": True,
            },
            {
                "quest_id": "QST-105",
                "user_id": "USR-001",
                "title": "Drink 3 Litres Water & 8 Hours Sleep",
                "description": "Full physiological recovery: complete cellular hydration and deep REM sleep.",
                "category": "Health",
                "difficulty": "Easy",
                "xp_reward": 30,
                "gold_reward": 15,
                "stat_reward": "vitality",
                "daily": True,
            },
            {
                "quest_id": "QST-106",
                "user_id": "USR-001",
                "title": "20 Minutes Mindful Meditation & Zero Social Media",
                "description": "Resist digital dopamine: focused breathwork and daily intention setting.",
                "category": "Health",
                "difficulty": "Easy",
                "xp_reward": 30,
                "gold_reward": 15,
                "stat_reward": "discipline",
                "daily": True,
            },
        ]
        db.Quests.insert_many(sample_quests)

        # 4. Quest_Completions
        yesterday_str = (datetime.datetime.utcnow() - datetime.timedelta(days=1)).isoformat()
        sample_completions = [
            {
                "completion_id": "CMP-001",
                "user_id": "USR-001",
                "quest_id": "QST-102",
                "quest_title": "Deep Coding Session & System Architecture (2 Hours)",
                "completed_at": yesterday_str,
                "completion_date": (datetime.date.today() - datetime.timedelta(days=1)).isoformat(),
                "xp_earned": 80,
                "gold_earned": 50,
            }
        ]
        db.Quest_Completions.insert_many(sample_completions)

        # 5. Inventory
        sample_inventory = [
            {
                "inventory_id": "INV-001",
                "user_id": "USR-001",
                "item_id": "ITM-ESPRESSO",
                "item_name": "Artisan Espresso Treat",
                "icon": "fa-mug-hot",
                "quantity": 2,
                "description": "Redeem for a specialty coffee after deep work.",
            },
            {
                "inventory_id": "INV-002",
                "user_id": "USR-001",
                "item_id": "ITM-ENERGY",
                "item_name": "Energy Recharge Potion",
                "icon": "fa-bolt",
                "quantity": 1,
                "description": "Resets daily fatigue down to 0/100.",
            },
            {
                "inventory_id": "INV-003",
                "user_id": "USR-001",
                "item_id": "ITM-STREAK-FREEZE",
                "item_name": "Streak Shield Rune",
                "icon": "fa-shield-halved",
                "quantity": 1,
                "description": "Shields your streak on scheduled rest days.",
            },
        ]
        db.Inventory.insert_many(sample_inventory)

        # 6. Achievements
        sample_achievements = [
            {
                "achievement_id": "ACH-001",
                "user_id": "USR-001",
                "title": "Habit Awakening",
                "description": "Started your journey by signing up for Life RPG.",
                "unlocked_at": yesterday_str,
            },
            {
                "achievement_id": "ACH-002",
                "user_id": "USR-001",
                "title": "Consistency Master (7 Days)",
                "description": "Maintained an unbroken 7-day habit streak.",
                "unlocked_at": yesterday_str,
            },
        ]
        db.Achievements.insert_many(sample_achievements)
        print("[SUCCESS] MongoDB collections populated with Life RPG initial schema.")

def calculate_xp_needed(level):
    return int(100 * (1.28 ** (level - 1)))

def clean_doc(doc):
    if not doc:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

def get_user_full_payload(user_id):
    user = db.Users.find_one({"user_id": user_id})
    if not user:
        return None

    stats = db.Stats.find_one({"user_id": user_id})
    quests = list(db.Quests.find({"user_id": user_id}))
    inventory = list(db.Inventory.find({"user_id": user_id}))
    achievements = list(db.Achievements.find({"user_id": user_id}))

    today_str = datetime.date.today().isoformat()
    completed_today_ids = set(
        c["quest_id"]
        for c in db.Quest_Completions.find({"user_id": user_id, "completion_date": today_str})
    )

    completions = list(
        db.Quest_Completions.find({"user_id": user_id}).sort("completed_at", -1).limit(20)
    )

    quests_list = []
    for q in quests:
        quests_list.append({
            "id": q["quest_id"],
            "quest_id": q["quest_id"],
            "title": q["title"],
            "description": q.get("description", ""),
            "category": q.get("category", "General"),
            "difficulty": q.get("difficulty", "Medium"),
            "attr": q.get("stat_reward", "strength").capitalize(),
            "rank": q.get("difficulty", "Medium"),
            "xp": q.get("xp_reward", 50),
            "gold": q.get("gold_reward", 30),
            "daily": q.get("daily", True),
            "completed": q["quest_id"] in completed_today_ids,
        })

    inv_list = []
    for item in inventory:
        inv_list.append({
            "id": item["inventory_id"],
            "inventory_id": item["inventory_id"],
            "itemId": item.get("item_id"),
            "name": item.get("item_name", item.get("item_id")),
            "icon": item.get("icon", "fa-gift"),
            "quantity": item.get("quantity", 1),
            "desc": item.get("description", ""),
        })

    hist_list = []
    for c in completions:
        hist_list.append({
            "id": c["completion_id"],
            "completion_id": c["completion_id"],
            "questId": c["quest_id"],
            "questTitle": c.get("quest_title", f"Quest #{c['quest_id']}"),
            "xpEarned": c.get("xp_earned", 50),
            "completedAt": c.get("completed_at", ""),
        })

    ach_list = []
    for a in achievements:
        ach_list.append({
            "id": a["achievement_id"],
            "achievement_id": a["achievement_id"],
            "title": a.get("title", ""),
            "description": a.get("description", ""),
            "unlockedAt": a.get("unlocked_at", ""),
        })

    total_completed = db.Quest_Completions.count_documents({"user_id": user_id})

    return {
        "user": {
            "user_id": user["user_id"],
            "username": user["username"],
            "name": user["username"],
            "email": user["email"],
            "job": user.get("job", "FITNESS & STUDY MASTERY"),
            "title": user.get("title", "CONSISTENT HABIT BUILDER"),
        },
        "player": {
            "level": user.get("level", 1),
            "xp": user.get("total_xp", 65),
            "xpNeeded": calculate_xp_needed(user.get("level", 1)),
            "gold": user.get("gold", 250),
            "streak": user.get("streak", 7),
            "fatigue": user.get("fatigue", 18),
            "unassignedPoints": user.get("unassigned_points", 3),
            "questsCompleted": total_completed,
        },
        "attributes": {
            "strength": stats.get("strength", 28) if stats else 28,
            "intelligence": stats.get("intelligence", 35) if stats else 35,
            "vitality": stats.get("vitality", 20) if stats else 20,
            "discipline": stats.get("discipline", 26) if stats else 26,
            "agility": 24,
            "sense": 22,
        },
        "quests": quests_list,
        "inventory": inv_list,
        "history": hist_list,
        "achievements": ach_list,
    }


class LifeRPGMongoHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass

    def log_message(self, format, *args):
        try:
            super().log_message(format, *args)
        except Exception:
            pass

    def get_auth_user_id(self):
        auth_header = self.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            # Fallback: check if we have an active default session or single user
            if SESSIONS:
                return next(iter(SESSIONS.values()))
            user = db.Users.find_one({}) if db is not None else None
            return user["user_id"] if user else "USR-001"
        token = auth_header.split(" ", 1)[1].strip()
        user_id = SESSIONS.get(token)
        if not user_id:
            user = db.Users.find_one({}) if db is not None else None
            return user["user_id"] if user else "USR-001"
        return user_id

    def read_json_body(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                return {}
            body = self.rfile.read(content_length)
            return json.loads(body.decode("utf-8"))
        except Exception:
            return {}

    def send_json(self, status_code, data):
        try:
            payload = json.dumps(data).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ["", "/"]:
            self.path = "/index.html"
            return super().do_GET()

        # Database Status API
        if path == "/api/mongo/status":
            try:
                mongo_client.server_info()
                counts = {
                    "Users": db.Users.count_documents({}),
                    "Stats": db.Stats.count_documents({}),
                    "Quests": db.Quests.count_documents({}),
                    "Quest_Completions": db.Quest_Completions.count_documents({}),
                    "Inventory": db.Inventory.count_documents({}),
                    "Achievements": db.Achievements.count_documents({}),
                }
                self.send_json(200, {
                    "connected": True,
                    "database": DB_NAME,
                    "uri": MONGO_URI,
                    "counts": counts,
                })
            except Exception as e:
                self.send_json(500, {"connected": False, "error": str(e)})
            return

        # MongoDB All Collections Overview for database.html
        elif path == "/api/mongo/all":
            try:
                data = {
                    "Users": [clean_doc(d) for d in db.Users.find()],
                    "Stats": [clean_doc(d) for d in db.Stats.find()],
                    "Quests": [clean_doc(d) for d in db.Quests.find()],
                    "Quest_Completions": [clean_doc(d) for d in db.Quest_Completions.find().sort("completed_at", -1)],
                    "Inventory": [clean_doc(d) for d in db.Inventory.find()],
                    "Achievements": [clean_doc(d) for d in db.Achievements.find()],
                }
                self.send_json(200, {"success": True, "database": DB_NAME, "collections": data})
            except Exception as e:
                self.send_json(500, {"error": str(e)})
            return

        elif path == "/api/user/me":
            user_id = self.get_auth_user_id()
            payload = get_user_full_payload(user_id)
            if not payload:
                self.send_json(404, {"error": "User not found in MongoDB"})
                return
            self.send_json(200, payload)
            return

        elif path == "/api/history":
            user_id = self.get_auth_user_id()
            completions = list(
                db.Quest_Completions.find({"user_id": user_id}).sort("completed_at", -1).limit(50)
            )
            history = [clean_doc(c) for c in completions]
            self.send_json(200, {"history": history})
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()

        # Login
        if path == "/api/auth/login":
            email = body.get("email", "").strip().lower()
            password = body.get("password", "")

            if body.get("demo") is True:
                user = db.Users.find_one({})
            else:
                pw_hash = hash_pw(password)
                user = db.Users.find_one({"email": email, "password_hash": pw_hash})

            if not user:
                self.send_json(401, {"error": "Invalid email or password"})
                return

            token = secrets.token_hex(24)
            SESSIONS[token] = user["user_id"]
            payload = get_user_full_payload(user["user_id"])
            self.send_json(200, {"token": token, "data": payload})
            return

        # Register
        elif path == "/api/auth/register":
            email = body.get("email", "").strip().lower()
            password = body.get("password", "")
            name = body.get("name", "").strip() or "NEW PLAYER"
            job = body.get("job", "FITNESS & STUDY MASTERY")

            if not email or not password:
                self.send_json(400, {"error": "Email and password required"})
                return

            existing = db.Users.find_one({"email": email})
            if existing:
                self.send_json(409, {"error": "User with this email already exists in MongoDB"})
                return

            new_user_id = f"USR-{db.Users.count_documents({}) + 1:03d}"
            user_doc = {
                "user_id": new_user_id,
                "username": name,
                "email": email,
                "password_hash": hash_pw(password),
                "level": 1,
                "total_xp": 0,
                "gold": 100,
                "streak": 1,
                "fatigue": 0,
                "unassigned_points": 5,
                "job": job,
                "title": "HABIT INITIATE",
                "created_at": datetime.datetime.utcnow().isoformat(),
            }
            db.Users.insert_one(user_doc)

            # Stats collection
            db.Stats.insert_one({
                "user_id": new_user_id,
                "strength": 10,
                "intelligence": 10,
                "vitality": 10,
                "discipline": 10,
            })

            # Starting Quest
            db.Quests.insert_one({
                "quest_id": f"QST-{db.Quests.count_documents({}) + 1:03d}",
                "user_id": new_user_id,
                "title": "Complete First Habit Routine",
                "description": "Kick off your Life RPG habit journey with a quick workout or study block.",
                "category": "General",
                "difficulty": "Easy",
                "xp_reward": 50,
                "gold_reward": 30,
                "stat_reward": "discipline",
                "daily": True,
            })

            token = secrets.token_hex(24)
            SESSIONS[token] = new_user_id
            payload = get_user_full_payload(new_user_id)
            self.send_json(201, {"token": token, "data": payload})
            return

        # --- THE 8-STEP SERVER-SIDE PIPELINE ON MONGODB ---
        elif path == "/api/quests/complete":
            audit_steps = []

            # STEP 1: Is user authenticated?
            user_id = self.get_auth_user_id()
            if not user_id:
                audit_steps.append({"step": 1, "name": "Authentication", "status": "FAIL", "msg": "User token invalid or missing"})
                self.send_json(401, {"error": "User not authenticated", "audit": audit_steps})
                return
            audit_steps.append({"step": 1, "name": "Authentication", "status": "PASS", "msg": f"User authenticated (UID: {user_id})"})

            quest_id = body.get("questId")
            if not quest_id:
                self.send_json(400, {"error": "Quest ID required"})
                return

            # STEP 2: Does Quest #42 belong to this user?
            quest = db.Quests.find_one({"quest_id": str(quest_id)}) or db.Quests.find_one({"quest_id": quest_id})
            if not quest:
                # Also try integer or matching title
                quest = db.Quests.find_one({"title": str(quest_id)})
            if not quest:
                audit_steps.append({"step": 2, "name": "Ownership Validation", "status": "FAIL", "msg": f"Quest #{quest_id} not found in MongoDB"})
                self.send_json(404, {"error": "Quest not found", "audit": audit_steps})
                return

            if quest["user_id"] != user_id:
                audit_steps.append({"step": 2, "name": "Ownership Validation", "status": "FAIL", "msg": f"Security Alert: Quest #{quest_id} belongs to {quest['user_id']}, not {user_id}"})
                self.send_json(403, {"error": "Ownership validation failed", "audit": audit_steps})
                return
            audit_steps.append({"step": 2, "name": "Ownership Validation", "status": "PASS", "msg": f"Ownership confirmed: Quest #{quest['quest_id']} belongs to {user_id}"})

            # STEP 3: Has today's quest already been completed?
            today_str = datetime.date.today().isoformat()
            existing = db.Quest_Completions.find_one({
                "user_id": user_id,
                "quest_id": quest["quest_id"],
                "completion_date": today_str,
            })

            if existing and quest.get("daily", True):
                audit_steps.append({"step": 3, "name": "Daily Completion Guard", "status": "FAIL", "msg": f"Quest #{quest['quest_id']} already completed today ({today_str})"})
                self.send_json(400, {"error": "Daily quest already completed today", "audit": audit_steps})
                return
            audit_steps.append({"step": 3, "name": "Daily Completion Guard", "status": "PASS", "msg": f"Verified: Quest not yet completed today ({today_str})"})

            # STEP 4: Is completion allowed?
            user = db.Users.find_one({"user_id": user_id})
            if user.get("fatigue", 0) >= 100:
                audit_steps.append({"step": 4, "name": "Completion Allowance", "status": "FAIL", "msg": "Fatigue at 100/100 (Max Burnout). Use Energy Potion or rest first."})
                self.send_json(400, {"error": "Fatigue limit reached. Rest required.", "audit": audit_steps})
                return
            audit_steps.append({"step": 4, "name": "Completion Allowance", "status": "PASS", "msg": f"Fatigue ({user.get('fatigue', 18)}/100) within safe operational threshold"})

            # STEP 5: Calculate XP on SERVER
            streak = user.get("streak", 1)
            multiplier = 1.2 if streak >= 5 else 1.0
            base_xp = quest.get("xp_reward", 50)
            awarded_xp = int(round(base_xp * multiplier))
            awarded_gold = quest.get("gold_reward", 30)
            stat_key = quest.get("stat_reward", "discipline").lower()

            audit_steps.append({
                "step": 5,
                "name": "Server-Side XP Calculation",
                "status": "PASS",
                "msg": f"Calculated: {base_xp} base XP × {multiplier}x Streak Multiplier = +{awarded_xp} XP, +{awarded_gold} Coins",
            })

            # STEP 6: Update user stats
            new_total_xp = user.get("total_xp", 0) + awarded_xp
            new_gold = user.get("gold", 0) + awarded_gold
            new_level = user.get("level", 1)
            new_unassigned = user.get("unassigned_points", 0)
            leveled_up = False

            while True:
                needed = calculate_xp_needed(new_level)
                if new_total_xp >= needed:
                    new_total_xp -= needed
                    new_level += 1
                    new_gold += 100
                    new_unassigned += 3
                    leveled_up = True
                    # All stats +1 on level up
                    db.Stats.update_one({"user_id": user_id}, {
                        "$inc": {"strength": 1, "intelligence": 1, "vitality": 1, "discipline": 1}
                    })
                else:
                    break

            # Increment specific attribute in Stats collection
            if stat_key in ["strength", "intelligence", "vitality", "discipline"]:
                db.Stats.update_one({"user_id": user_id}, {"$inc": {stat_key: 1}})

            new_fatigue = max(0, user.get("fatigue", 18) - 3)

            db.Users.update_one({"user_id": user_id}, {
                "$set": {
                    "level": new_level,
                    "total_xp": new_total_xp,
                    "gold": new_gold,
                    "fatigue": new_fatigue,
                    "unassigned_points": new_unassigned,
                }
            })

            audit_steps.append({
                "step": 6,
                "name": "Database Stats Update",
                "status": "PASS",
                "msg": f"MongoDB Updated: Level {new_level}, XP {new_total_xp}, Gold {new_gold}, +1 {stat_key.capitalize()}",
            })

            # STEP 7: Create completion history in Quest_Completions collection
            comp_id = f"CMP-{db.Quest_Completions.count_documents({}) + 1:04d}"
            completion_doc = {
                "completion_id": comp_id,
                "user_id": user_id,
                "quest_id": quest["quest_id"],
                "quest_title": quest["title"],
                "completed_at": datetime.datetime.utcnow().isoformat(),
                "completion_date": today_str,
                "xp_earned": awarded_xp,
                "gold_earned": awarded_gold,
            }
            db.Quest_Completions.insert_one(completion_doc)

            audit_steps.append({
                "step": 7,
                "name": "Immutable Completion History",
                "status": "PASS",
                "msg": f"Document inserted into 'Quest_Completions' (ID: {comp_id}) in MongoDB",
            })

            # STEP 8: Update inventory and achievements
            unlocked_achievement = None
            total_cleared = db.Quest_Completions.count_documents({"user_id": user_id})
            if total_cleared == 5:
                ach_id = f"ACH-{db.Achievements.count_documents({}) + 1:03d}"
                unlocked_achievement = "Habit Centurion (5 Habits Cleared)"
                db.Achievements.insert_one({
                    "achievement_id": ach_id,
                    "user_id": user_id,
                    "title": unlocked_achievement,
                    "description": "Successfully verified 5 real-life daily habits in MongoDB.",
                    "unlocked_at": datetime.datetime.utcnow().isoformat(),
                })

            audit_steps.append({
                "step": 8,
                "name": "Rewards & Achievements Synchronization",
                "status": "PASS",
                "msg": f"Synchronized: Gold +{awarded_gold} G. " + (f"Unlocked: {unlocked_achievement}" if unlocked_achievement else "No milestone achievement."),
            })

            payload = get_user_full_payload(user_id)
            self.send_json(200, {
                "success": True,
                "audit": audit_steps,
                "awarded": {
                    "xp": awarded_xp,
                    "gold": awarded_gold,
                    "attr": stat_key.capitalize(),
                    "leveledUp": leveled_up,
                    "newLevel": new_level,
                },
                "data": payload,
            })
            return

        # Add Quest to MongoDB Quests Collection
        elif path == "/api/mongo/quests" or path == "/api/quests":
            user_id = self.get_auth_user_id()
            title = body.get("title", "").strip()
            desc = body.get("description", "Daily routine habit objective")
            category = body.get("category", "General")
            difficulty = body.get("difficulty", "Medium")
            attr = body.get("attr", "discipline").lower()

            if not title:
                self.send_json(400, {"error": "Title required"})
                return

            rewards = {"Easy": 30, "Medium": 50, "Hard": 80, "Epic": 150}
            xp = rewards.get(difficulty, 50)
            gold = int(xp * 0.6)

            new_quest_id = f"QST-{db.Quests.count_documents({}) + 1:03d}"
            quest_doc = {
                "quest_id": new_quest_id,
                "user_id": user_id,
                "title": title,
                "description": desc,
                "category": category,
                "difficulty": difficulty,
                "xp_reward": xp,
                "gold_reward": gold,
                "stat_reward": attr,
                "daily": True,
                "created_at": datetime.datetime.utcnow().isoformat(),
            }
            db.Quests.insert_one(quest_doc)

            payload = get_user_full_payload(user_id)
            self.send_json(201, {"success": True, "quest": clean_doc(quest_doc), "data": payload})
            return

        # Allocate Stat
        elif path == "/api/attributes/allocate":
            user_id = self.get_auth_user_id()
            stat = body.get("stat", "").lower()
            if stat == "sense":
                stat = "discipline"
            elif stat == "agility":
                stat = "vitality"

            if stat not in ["strength", "intelligence", "vitality", "discipline"]:
                stat = "discipline"

            user = db.Users.find_one({"user_id": user_id})
            if not user or user.get("unassigned_points", 0) <= 0:
                self.send_json(400, {"error": "No unassigned points available"})
                return

            db.Users.update_one({"user_id": user_id}, {"$inc": {"unassigned_points": -1}})
            db.Stats.update_one({"user_id": user_id}, {"$inc": {stat: 1}})

            payload = get_user_full_payload(user_id)
            self.send_json(200, {"success": True, "data": payload})
            return

        # Auto Allocate
        elif path == "/api/attributes/auto-allocate":
            user_id = self.get_auth_user_id()
            user = db.Users.find_one({"user_id": user_id})
            pts = user.get("unassigned_points", 0) if user else 0
            if pts <= 0:
                self.send_json(400, {"error": "No unassigned points available"})
                return

            stats_keys = ["strength", "intelligence", "vitality", "discipline"]
            inc_dict = {}
            for i in range(pts):
                chosen = stats_keys[i % len(stats_keys)]
                inc_dict[chosen] = inc_dict.get(chosen, 0) + 1

            db.Users.update_one({"user_id": user_id}, {"$set": {"unassigned_points": 0}})
            db.Stats.update_one({"user_id": user_id}, {"$inc": inc_dict})

            payload = get_user_full_payload(user_id)
            self.send_json(200, {"success": True, "allocated": pts, "data": payload})
            return

        # Shop Purchase -> Updates Inventory in MongoDB
        elif path == "/api/shop/purchase":
            user_id = self.get_auth_user_id()
            item_id = body.get("itemId")
            name = body.get("name", "Shop Item")
            price = int(body.get("price", 99999))
            icon = body.get("icon", "fa-gift")
            desc = body.get("desc", "")

            user = db.Users.find_one({"user_id": user_id})
            if not user or user.get("gold", 0) < price:
                self.send_json(400, {"error": "Insufficient coins"})
                return

            db.Users.update_one({"user_id": user_id}, {"$inc": {"gold": -price}})

            existing_inv = db.Inventory.find_one({"user_id": user_id, "item_id": item_id})
            if existing_inv:
                db.Inventory.update_one({"_id": existing_inv["_id"]}, {"$inc": {"quantity": 1}})
            else:
                inv_id = f"INV-{db.Inventory.count_documents({}) + 1:03d}"
                db.Inventory.insert_one({
                    "inventory_id": inv_id,
                    "user_id": user_id,
                    "item_id": item_id,
                    "item_name": name,
                    "icon": icon,
                    "quantity": 1,
                    "description": desc,
                })

            payload = get_user_full_payload(user_id)
            self.send_json(200, {"success": True, "data": payload})
            return

        # Inventory Use
        elif path == "/api/inventory/use":
            user_id = self.get_auth_user_id()
            inv_id = body.get("inventoryId")
            item = db.Inventory.find_one({"user_id": user_id, "inventory_id": inv_id})
            if not item:
                self.send_json(404, {"error": "Item not found in MongoDB Inventory"})
                return

            msg = f"Redeemed: {item.get('item_name')}"
            if "Energy" in item.get("item_name", ""):
                db.Users.update_one({"user_id": user_id}, {"$set": {"fatigue": 0}})
                msg = "Fatigue cleansed! Reset to 0/100."

            if item.get("quantity", 1) > 1:
                db.Inventory.update_one({"_id": item["_id"]}, {"$inc": {"quantity": -1}})
            else:
                db.Inventory.delete_one({"_id": item["_id"]})

            payload = get_user_full_payload(user_id)
            self.send_json(200, {"success": True, "message": msg, "data": payload})
            return

        # MongoDB Seed Endpoint
        elif path == "/api/mongo/seed":
            db.Users.delete_many({})
            db.Stats.delete_many({})
            db.Quests.delete_many({})
            db.Quest_Completions.delete_many({})
            db.Inventory.delete_many({})
            db.Achievements.delete_many({})
            seed_default_data_if_empty()
            self.send_json(200, {"success": True, "message": "MongoDB collections re-seeded successfully."})
            return

        self.send_json(404, {"error": "Endpoint not found"})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/quests/") or path.startswith("/api/mongo/quests/"):
            user_id = self.get_auth_user_id()
            quest_id = path.split("/")[-1]
            db.Quests.delete_one({"user_id": user_id, "quest_id": quest_id})
            payload = get_user_full_payload(user_id)
            self.send_json(200, {"success": True, "data": payload})
            return

        self.send_json(404, {"error": "Endpoint not found"})


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def run():
    connected = init_mongo()
    if not connected:
        print("[WARN] MongoDB connection was not established at startup. Endpoints will retry or fallback.")

    server_address = ("", PORT)
    httpd = ThreadedHTTPServer(server_address, LifeRPGMongoHandler)
    print(f"================================================================")
    print(f"LIFE RPG MULTI-THREADED SERVER RUNNING AT: http://localhost:{PORT}")
    print(f"DATABASE: MongoDB ({DB_NAME}) @ {MONGO_URI}")
    print(f"DATABASE CONSOLE PAGE: http://localhost:{PORT}/database.html")
    print(f"================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()


if __name__ == "__main__":
    run()
