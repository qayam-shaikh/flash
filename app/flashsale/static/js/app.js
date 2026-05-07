/**
 * app.js  –  FlashSale front-end
 *
 * Provides:
 *  - buyProduct(id)    : POST /buy and update UI without page reload
 *  - changeQty(id, d)  : increment / decrement the quantity input
 *  - showToast(msg, t) : animated notification
 */

"use strict";

/* ── Quantity control ──────────────────────────────────────────────────── */

function changeQty(productId, delta) {
  const input = document.getElementById(`qty-${productId}`);
  let val = parseInt(input.value, 10) + delta;
  if (val < 1)  val = 1;
  if (val > 10) val = 10;
  input.value = val;
}


/* ── Cart handler ──────────────────────────────────────────────────────── */

let cartCount = 0;

function addToCart(productId) {
  const qtyInput = document.getElementById(`qty-${productId}`);
  const quantity = parseInt(qtyInput.value, 10);
  
  cartCount += quantity;
  document.getElementById("cart-count").textContent = cartCount;
  
  showToast(`🛒 Added ${quantity} item(s) to cart!`, "success");
}


/* ── Buy handler ───────────────────────────────────────────────────────── */

async function buyProduct(productId) {
  const btn      = document.getElementById(`buy-${productId}`);
  const qtyInput = document.getElementById(`qty-${productId}`);
  const quantity = parseInt(qtyInput.value, 10);

  // Disable button while the request is in flight
  btn.disabled   = true;
  btn.textContent = "Processing…";

  try {
    const response = await fetch("/buy", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ product_id: productId, quantity }),
    });

    const data = await response.json();

    if (response.ok) {
      // ── Success: update the stock badge + button text ──────────────────
      showToast(
        `✅ Order #${data.order_id} placed! ${data.remaining_stock} left.`,
        "success"
      );

      updateCard(productId, data.remaining_stock);
    } else {
      // ── API-level error ────────────────────────────────────────────────
      const msg = data.error || "Something went wrong.";
      showToast(`❌ ${msg}`, "error");

      if (data.available === 0) {
        markSoldOut(productId);
      } else {
        // Re-enable so user can try again
        btn.disabled    = false;
        btn.textContent = "Buy Now";
      }
    }
  } catch (err) {
    // Network or parse error
    showToast("❌ Network error – please try again.", "error");
    btn.disabled    = false;
    btn.textContent = "Buy Now";
  }
}


/* ── UI helpers ────────────────────────────────────────────────────────── */

function updateCard(productId, remaining) {
  const card  = document.getElementById(`card-${productId}`);
  const badge = card.querySelector(".stock-badge");
  const btn   = document.getElementById(`buy-${productId}`);

  if (remaining === 0) {
    markSoldOut(productId);
    return;
  }

  // Update badge class + text
  badge.className = `stock-badge ${remaining <= 10 ? "badge-low" : "badge-ok"}`;
  badge.textContent = remaining <= 10
    ? `Only ${remaining} left!`
    : `${remaining} in stock`;

  // Re-enable buy button
  btn.disabled    = false;
  btn.textContent = "Buy Now";
}


function markSoldOut(productId) {
  const card  = document.getElementById(`card-${productId}`);
  const badge = card.querySelector(".stock-badge");
  const btn   = document.getElementById(`buy-${productId}`);

  card.classList.add("sold-out");
  badge.className   = "stock-badge badge-empty";
  badge.textContent = "SOLD OUT";
  btn.disabled      = true;
  btn.textContent   = "Sold Out";
}


/* ── Toast ─────────────────────────────────────────────────────────────── */

let _toastTimer = null;

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.className  = `toast ${type}`;   // removes "hidden", adds type class
  toast.textContent = message;

  // Auto-hide after 3.5 s
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.className = "toast hidden";
  }, 3500);
}
