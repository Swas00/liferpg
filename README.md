# LIFE RPG // Gamified Daily Habit Progression Engine

An interactive, high-performance web application that transforms daily habits and productivity routines into an immersive RPG leveling experience.

---

## Features

- **240-Frame Dual-Theme Character Scroll Animation**:
  - Smooth scrub animation that rotates and animates a 3D cybernetic character as you scroll down the page.
  - Features dual outfits: Obsidian Stealth Armor in **Dark Mode** and Luminous Techwear in **Light Mode**.
  - Instant pose-synchronized theme switching with zero lag.
- **Classy Tactical RPG Cursor**:
  - Precision 6px core dot with hardware-accelerated 0ms latency tracking.
  - Fluid trailing reticle ring with spring physics and corner bracket HUD aesthetics.
  - Interactive hover expansion on buttons/cards and tactical click animations.
  - Automatically adapts its color palette between Neon Azure and Royal Sapphire Cobalt.
- **100% Uniform Design System**:
  - Consistent glassmorphism across Hero, Attributes, Daily Habits Directory, Add Habit Creator, and Rewards Store.
  - Light & Dark mode support across every single block, card, modal, and records table.
- **8-Stage Anti-Cheat Verification Pipeline**:
  - Real-time cryptographic timestamp hashing, frequency throttle checks, streak multiplier math, level curve calculation, and reward minting.
- **Local Multi-Threaded Backend**:
  - Python HTTP server supporting fast multi-threading, RESTful JSON APIs, session cookies, and MongoDB/SQLite persistence.
- **Fully Responsive**:
  - Optimized for Desktop, Tablet, and Mobile viewport layouts.

---

## Quick Start

1. Clone or download the repository.
2. Start the local server:
   ```bash
   python server.py
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:8080/
   ```

---

## Tech Stack
- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System & Glassmorphism), Vanilla JavaScript ES6+
- **Animation**: GSAP 3, ScrollTrigger, HTML5 Canvas 2D Engine
- **Backend**: Python HTTP Server (Multi-threaded, REST API)
- **Database**: SQLite / MongoDB Document Store
