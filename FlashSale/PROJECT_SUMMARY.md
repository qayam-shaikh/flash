# FlashSale Project Summary (AI Context)

This file documents the core architecture, implementation details, and features of the **FlashSale** application. This project was built as a lightweight, high-performance, and thread-safe backend for an e-commerce flash sale scenario.

## 1. Core Technology Stack
- **Framework**: Flask (Python 3.10+) using the Application Factory pattern.
- **Database**: SQLite with **WAL (Write-Ahead Logging)** journal mode for enhanced concurrency.
- **Frontend**: Vanilla HTML5, CSS3 (Modern Glassmorphism aesthetics), and JavaScript (Fetch API for real-time stock updates).
- **Logging**: Rotating File Handler + Coloured Console Handler.

## 2. Key Backend Features & Implementation
- **Atomic Stock Management**: Uses the "Update-with-Guard" pattern in SQL to prevent negative stock without application-level locks:
  ```sql
  UPDATE products SET stock = stock - ? 
  WHERE id = ? AND stock >= ?;
  ```
- **Blueprint Routing**: Isolated routing architecture under `/flashsale/routes.py`.
- **Automatic Database Initialization**: The app seeds the database with sample products automatically on the first run.
- **API Persistence**: All orders and stock levels are persisted across restarts in `flashsale.db`.
- **Thread Safety**: Uses `check_same_thread=False` and explicit transaction control (`BEGIN`, `COMMIT`, `ROLLBACK`) to allow multi-threaded Flask workers to share connections safely.

## 3. Frontend & UI
- **Live Dashboard**: A modern, single-page UI (`/`) that displays products and allows users to buy items without a page refresh.
- **Dynamic Elements**: Uses CSS animations and a "Glassmorphism" design system for a premium feel.
- **Real-time Feedback**: JavaScript-based status messages for "Out of Stock" or "Success" responses.

## 4. Key Project Files
- `run.py`: Entry point for the application.
- `flashsale/routes.py`: API endpoints (`/products`, `/buy`, `/orders`, etc.).
- `flashsale/models.py`: Thin data-access layer for products and orders.
- `flashsale/database.py`: Low-level SQLite connection management and schema definition.
- `flashsale/logger.py`: Centralised logging configuration.
- `API_EXAMPLES.md`: Comprehensive `curl` reference for all API endpoints.

## 5. Security & Error Handling
- **Order Limits**: Configurable max limit per order (`MAX_ORDER_QUANTITY = 10`) set in `config.py`.
- **Validation**: Strict JSON validation, type-checking, and range-checking for all incoming purchase requests.
- **Logging**: Captures every purchase attempt, successful order, and out-of-stock event into `flashsale.log`.

## 6. Testing & Validation
- **Concurrency Testability**: Designed to be tested with multiple simultaneous requests to verify atomic stock reduction logic.
- **API First**: The entire core logic is accessible via RESTful JSON endpoints.
