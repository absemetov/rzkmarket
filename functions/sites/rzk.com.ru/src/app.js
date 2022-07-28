import {startAutocomplete} from "./autocomplete";
import {search, searchPanel} from "./instantsearch";
// Import custom plugins
import Modal from "bootstrap/js/dist/modal";
import "bootstrap/js/dist/offcanvas";
import "bootstrap/js/dist/collapse";
import "bootstrap/js/dist/dropdown";
import "bootstrap/js/dist/alert";
import SmartPhoto from "smartphoto";

import i18nContext from "./i18n";
const lang = document.getElementById("addToCart").dataset.lang;
const i18n = i18nContext[lang];

search.start();
startAutocomplete();

search.on("render", () => {
  if (window.location.pathname == "/search") {
    searchPanel("show");
  }
});

// back prev buttons trigger
window.addEventListener("popstate", function() {
  if (window.location.pathname !== "/search") {
    searchPanel("hide");
  }
});
// open modal algolia
const productModalEl = document.getElementById("productModal");
const productModal = new Modal(productModalEl);
const addButton = document.getElementById("addToCart");
const currency = addButton.dataset.currency;
productModalEl.addEventListener("show.bs.modal", async (event) => {
  // Extract info from data-bs-* attributes
  const button = event.relatedTarget;
  if (button) {
    const productId = button.dataset.productId;
    const productName = button.dataset.productName;
    const productBrand = button.dataset.productBrand;
    const productImg2 = button.dataset.productImg2;
    const sellerId = button.dataset.sellerId;
    const seller = button.dataset.seller;
    // add placeholders
    const modalBody = productModalEl.querySelector(".modal-body");
    // const modalFooter = productModalEl.querySelector(".modal-footer");
    modalBody.innerHTML = `<div class="card text-center h-100">
      <img src="${productImg2}" onerror="this.src = '/icons/photo_error.svg';" class="card-img-top" alt="${productName}">
      <div class="card-body">
        ${productBrand !== "undefined" ? "<h6>" + productBrand + "</h6>" : ""}
        <h6>
          <a href="/o/${sellerId}/p/${productId}">${productName}</a> <small class="text-muted">(${productId})</small>
          <a href="//t.me/RzkMarketBot?start=o_${sellerId}_p_${productId}" target="_blank" class="ps-1 text-decoration-none">
            <i class="bi bi-telegram"></i>
          </a>
        </h6>
        <h6>${seller}</h6>
      </div>
      <div class="card-footer">
        <h3>
          <span class="placeholder">111</span><small class="text-muted">${currency}</small>
        </h3>
        <div class="d-grid gap-2">
          <a href="#" tabindex="-1" class="btn btn-success disabled placeholder"></a>
          <a href="#" tabindex="-1" class="btn btn-primary disabled placeholder mt-2"></a>
        </div>
      </div>
    </div>`;
    // modalFooter.innerHTML = `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    // <a href="/o/${sellerId}/cart"  class="text-nowrap btn btn-primary position-relative" role="button">
    //   Корзина <strong id="totalSumNavAlg">0 ${currencyName}</strong>
    //   <span id="cartCountNavAlg" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
    //     0
    //     <span class="visually-hidden">count goods</span>
    //   </span>
    // </a>`;
    // get product data
    const productRes = await fetch(`/o/${sellerId}/p/${productId}`, {method: "POST"});
    const product = await productRes.json();
    console.log(product);
    // Update the modal"s content.
    // const modalTitle = exampleModal.querySelector(".modal-title");
    // modalTitle.textContent = product.name;
    // modalBodyInput.value = product.price;
    const cardFooter = productModalEl.querySelector(".card-footer");
    cardFooter.innerHTML = `
            <h3>
              ${product.price} <small class="text-muted">${currency}</small>
            </h3>
            <div class="d-grid gap-2">
            <button type="button" class="btn ${product.qty ? "btn-success" : "btn-primary"}" data-bs-toggle="modal"
              data-bs-target="#cartAddModal"
              data-product-id="${product.id}"
              data-product-name="${product.name}"
              data-product-unit="${product.unit}"
              data-product-qty="${product.qty ? product.qty : 0}"
              data-seller-id="${sellerId}"
              data-modal-close="true">
              ${product.qty ? product.qty + " " + product.unit + " " + product.sum + " " + currency : i18n.btn_buy}
            </button>
            <a href="/o/${sellerId}/cart"  class="btn btn-primary position-relative mt-2" role="button">
              ${i18n.btn_cart} <strong id="totalSumNavAlg">${product.cartInfo.totalSum} ${currency}</strong>
              <span id="cartCountNavAlg" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                ${product.cartInfo.cartCount}
                <span class="visually-hidden">count goods</span>
              </span>
            </a>
          </div>`;
  }
});

// fullscreen
const fullscreen = document.getElementById("fullscreen");
fullscreen.addEventListener("click", () => {
  productModalEl.querySelector(".modal-dialog").classList.toggle("modal-fullscreen");
});

// lightbox
new SmartPhoto(".js-smartphoto", {
  resizeStyle: "fit",
});
new SmartPhoto(".js-smartphoto-single", {
  resizeStyle: "fit",
  arrows: false,
  nav: false,
});

// modal cart
// helper round to 2 decimals
const roundNumber = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
const cartAddModalEl = document.getElementById("cartAddModal");
const cartAddModal = new Modal(cartAddModalEl);
// const addButton = document.getElementById("addToCart");
const delButton = document.getElementById("deleteFromCart");
const qtyInput = document.getElementById("qty");
// show info after add prod in button
let button = {};

// show algolia form when close
cartAddModalEl.addEventListener("hide.bs.modal", function(event) {
  if (button.getAttribute("data-modal-close")) {
    productModal.show();
  }
});

cartAddModalEl.addEventListener("show.bs.modal", function(event) {
  // Button that triggered the modal
  button = event.relatedTarget;
  // Extract info from data-bs-* attributes
  // set default values
  qtyInput.value = "";
  delButton.classList.add("d-none");
  addButton.disabled = false;
  delButton.disabled = false;
  // Update the modal's content.
  const modalTitle = cartAddModalEl.querySelector(".modal-title");
  const modalUnit = cartAddModalEl.querySelector("#basic-addon2");
  modalTitle.textContent = `${button.getAttribute("data-product-name")} (${button.getAttribute("data-product-id")})`;
  modalUnit.textContent = button.getAttribute("data-product-unit");
});
// focus qty input when modal shown
cartAddModalEl.addEventListener("shown.bs.modal", function(event) {
  const productCartQty = + button.getAttribute("data-product-qty");
  if (productCartQty) {
    qtyInput.value = productCartQty;
    delButton.classList.remove("d-none");
  }
  qtyInput.focus();
  qtyInput.select();
});
// add product to cart

const form = document.getElementById("addToCartForm");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  addButton.disabled = true;
  delButton.disabled = true;
  const qty = + qtyInput.value;
  const productId = button.getAttribute("data-product-id");
  const added = + button.getAttribute("data-product-qty");
  const sellerId = button.getAttribute("data-seller-id");
  const response = await fetch(`/o/${sellerId}/cart/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify({
      productId,
      qty,
      added,
    }),
  });
  const resJson = await response.json();
  if (!response.ok) {
    // throw new Error(resJson.error);
    alert(resJson.error);
    addButton.disabled = false;
    delButton.disabled = false;
  }
  if (qty) {
    button.innerText = `${qty} ${button.dataset.productUnit} ${roundNumber(qty * resJson.price)} ${currency}`;
    button.setAttribute("data-product-qty", qty);
    button.classList.remove("btn-primary");
    button.classList.add("btn-success");
  } else {
    button.innerText = "Купить";
    button.classList.remove("btn-success");
    button.classList.add("btn-primary");
    button.removeAttribute("data-product-qty");
  }
  const cartCountNav = document.getElementById("cartCountNav");
  const totalSumNav = document.getElementById("totalSumNav");
  // total cart data
  const totalQty = document.getElementById("totalQty");
  const totalSum = document.getElementById("totalSum");
  if (totalQty) {
    totalQty.innerText = resJson.cartInfo.totalQty;
    totalSum.innerText = `${resJson.cartInfo.totalSum}${currency}`;
  }
  // update algolia product
  const cartCountNavAlg = document.getElementById("cartCountNavAlg");
  const totalSumNavAlg = document.getElementById("totalSumNavAlg");
  if (cartCountNavAlg) {
    cartCountNavAlg.innerText = resJson.cartInfo.cartCount;
    totalSumNavAlg.innerText = `${resJson.cartInfo.totalSum}${currency}`;
  }
  if (cartCountNav) {
    cartCountNav.innerText = resJson.cartInfo.cartCount;
    totalSumNav.innerText = `${resJson.cartInfo.totalSum}${currency}`;
  }
  // hide modal
  cartAddModal.hide();
});
// delete product
delButton.addEventListener("click", async () => {
  qtyInput.value = "";
  addButton.click();
});
