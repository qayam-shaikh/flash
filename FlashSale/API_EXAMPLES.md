# FlashSale – API Reference & Curl Examples

## Base URL
```
http://localhost:5000
```

---

## 1. List All Products

```bash
curl -s http://localhost:5000/products | python3 -m json.tool
```

**Response 200:**
```json
[
  {"id": 1, "name": "Wireless Earbuds – Flash Deal", "price": 29.99, "stock": 50},
  {"id": 2, "name": "USB-C Hub 7-in-1",             "price": 19.99, "stock": 30},
  {"id": 3, "name": "Mechanical Keyboard",           "price": 89.99, "stock": 20},
  {"id": 4, "name": "LED Gaming Mouse",              "price": 24.99, "stock": 100},
  {"id": 5, "name": "Portable Power Bank 20000mAh",  "price": 34.99, "stock": 5}
]
```

---

## 2. Get Single Product

```bash
curl -s http://localhost:5000/products/1 | python3 -m json.tool
```

**Response 200:**
```json
{"id": 1, "name": "Wireless Earbuds – Flash Deal", "price": 29.99, "stock": 50}
```

**Response 404:**
```json
{"error": "Product not found"}
```

---

## 3. Buy a Product ← Core Flash-Sale Endpoint

```bash
curl -s -X POST http://localhost:5000/buy \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "quantity": 2}' \
  | python3 -m json.tool
```

**Response 201 (success):**
```json
{
  "message":         "Order placed successfully",
  "order_id":        1,
  "product":         "Wireless Earbuds – Flash Deal",
  "quantity":        2,
  "remaining_stock": 48
}
```

**Response 409 (out of stock):**
```json
{"error": "Out of stock", "available": 0}
```

**Response 400 (bad input):**
```json
{"error": "Missing required field: product_id"}
```

---

## 4. List All Orders (admin)

```bash
curl -s http://localhost:5000/orders | python3 -m json.tool
```

**Response 200:**
```json
[
  {
    "id": 1,
    "product_id": 1,
    "product_name": "Wireless Earbuds – Flash Deal",
    "quantity": 2,
    "created_at": "2026-04-03T15:25:56.580745+00:00"
  }
]
```

---

## Postman Quick Import

Create a new collection and add these requests:

| Method | URL                          | Body (JSON)                              |
|--------|------------------------------|------------------------------------------|
| GET    | `{{base}}/products`          | –                                        |
| GET    | `{{base}}/products/1`        | –                                        |
| POST   | `{{base}}/buy`               | `{"product_id": 1, "quantity": 1}`       |
| GET    | `{{base}}/orders`            | –                                        |

Set environment variable `base = http://localhost:5000`.

---

## Edge-Case Tests

### Try to over-buy (trigger Out-of-Stock)
```bash
# Buy 5 units of product 5 (only 5 in stock after seed, so second call fails)
curl -s -X POST http://localhost:5000/buy \
  -H "Content-Type: application/json" \
  -d '{"product_id": 5, "quantity": 5}' | python3 -m json.tool

curl -s -X POST http://localhost:5000/buy \
  -H "Content-Type: application/json" \
  -d '{"product_id": 5, "quantity": 1}' | python3 -m json.tool
# → {"error": "Out of stock", "available": 0}
```

### Exceed max quantity per order
```bash
curl -s -X POST http://localhost:5000/buy \
  -H "Content-Type: application/json" \
  -d '{"product_id": 1, "quantity": 99}' | python3 -m json.tool
# → {"error": "quantity cannot exceed 10 per order"}
```
