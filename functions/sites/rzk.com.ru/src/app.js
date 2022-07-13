import {startAutocomplete} from "./autocomplete";
import {search, searchPanel} from "./instantsearch";
// Import custom plugins
import Modal from "bootstrap/js/dist/modal";
import "bootstrap/js/dist/offcanvas";
import "bootstrap/js/dist/collapse";
import SmartPhoto from "smartphoto";

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
productModalEl.addEventListener("show.bs.modal", async (event) => {
  // Extract info from data-bs-* attributes
  const button = event.relatedTarget;
  if (button) {
    const productId = button.getAttribute("data-product-id");
    const productName = button.getAttribute("data-product-name");
    const productImg1 = button.getAttribute("data-product-img1");
    const sellerId = button.getAttribute("data-seller-id");
    // add placeholders
    const modalBody = productModalEl.querySelector(".modal-body");
    modalBody.innerHTML = `<div class="card text-center h-100">
      <img src="${productImg1}" onerror="this.src = '/icons/photo_error.svg';" class="card-img-top" alt="${productName}">
      <div class="card-body">
        <h5 class="card-title">
          <a href="/p/${productId}">${productName}</a> <small class="text-muted">(${productId})</small>
          <a href="//t.me/RzkMarketBot?start=o_${sellerId}_p_${productId}" target="_blank" class="ps-1 text-decoration-none">
            <i class="bi bi-telegram"></i>
          </a>
        </h5>
      </div>
      <div class="card-footer">
        <span class="placeholder col-7"></span>
        <span class="placeholder col-4"></span>
        <span class="placeholder col-4"></span>
        <span class="placeholder col-6"></span>
        <span class="placeholder col-8"></span>
        <a href="#" tabindex="-1" class="btn btn-primary disabled placeholder col-6"></a>
      </div>
    </div>`;
    // get product data
    const productRes = await fetch(`//localhost:5000/o/${sellerId}/p/${productId}`, {method: "POST"});
    const product = await productRes.json();
    console.log(product);
    // Update the modal"s content.
    // const modalTitle = exampleModal.querySelector(".modal-title");
    // modalTitle.textContent = product.name;
    // modalBodyInput.value = product.price;
    const modalFooter = productModalEl.querySelector(".card-footer");
    const addButton = document.getElementById("addToCart");
    const currencyName = addButton.getAttribute("data-object-currencyName");
    modalFooter.innerHTML = `
            <h6>${product.name} ${product.price} ${currencyName}</h6>
            <div class="d-grid gap-2">
            <button type="button" class="btn ${product.qty ? "btn-success" : "btn-primary"}" data-bs-toggle="modal"
              data-bs-target="#cartAddModal"
              data-product-id="${product.id}"
              data-product-name="${product.name}"
              data-product-unit="${product.unit}"
              data-product-qty="${product.qty ? product.qty : 0}"
              data-seller-id="${sellerId}">
              ${product.qty ? product.qty + " " + product.unit + " " + product.sum + " " + currencyName : "Купить"}
            </button>
          </div>`;
  }
});

// lightbox
new SmartPhoto(".js-smartphoto", {
  resizeStyle: "fit",
});
// modal cart
// helper round to 2 decimals
const roundNumber = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
const cartAddModalEl = document.getElementById("cartAddModal");
const cartAddModal = new Modal(cartAddModalEl);
const addButton = document.getElementById("addToCart");
const delButton = document.getElementById("deleteFromCart");
const qtyInput = document.getElementById("qty");
// show info after add prod in button
let button = {};

// show algolia form when close
cartAddModalEl.addEventListener("hide.bs.modal", function(event) {
  productModal.show();
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
  try {
    addButton.disabled = true;
    delButton.disabled = true;
    const qty = + qtyInput.value;
    const productId = button.getAttribute("data-product-id");
    const added = + button.getAttribute("data-product-qty");
    const sellerId = button.getAttribute("data-seller-id");
    const response = await fetch(`http://localhost:5000/o/${sellerId}/cart/add`, {
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
      throw new Error(resJson.error);
    }
    const currencyName = addButton.getAttribute("data-object-currencyName");
    if (qty) {
      button.innerText = `${qty} ${button.getAttribute("data-product-unit")} ${roundNumber(qty * resJson.price)} ${currencyName}`;
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
    const totalQty = document.getElementById("totalQty");
    const totalSum = document.getElementById("totalSum");
    if (totalQty) {
      totalQty.innerText = resJson.cartInfo.totalQty;
    }
    if (totalSum) {
      totalSum.innerText = `${resJson.cartInfo.totalSum} ${currencyName}`;
    }
    cartCountNav.innerText = resJson.cartInfo.cartCount;
    totalSumNav.innerText = `${resJson.cartInfo.totalSum} ${currencyName}`;
    // hide modal
    cartAddModal.hide();
  } catch (error) {
    alert(error);
    addButton.disabled = false;
    delButton.disabled = false;
  }
});
// delete product
delButton.addEventListener("click", async () => {
  qtyInput.value = "";
  addButton.click();
});
