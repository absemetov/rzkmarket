import {startAutocomplete} from "./autocomplete";
import {search, searchPanel} from "./instantsearch";
// Import custom plugins
import Modal from "bootstrap/js/dist/modal";
import "bootstrap/js/dist/offcanvas";
import "bootstrap/js/dist/collapse";

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
const exampleModal = document.getElementById("exampleModal");

exampleModal.addEventListener("show.bs.modal", async (event) => {
  const modalBody = exampleModal.querySelector(".modal-body");
  // Extract info from data-bs-* attributes
  const button = event.relatedTarget;
  const productId = button.getAttribute("data-product-id");
  const productName = button.getAttribute("data-product-name");
  const productImg1 = button.getAttribute("data-product-img1");
  const sellerId = button.getAttribute("data-seller-id");
  // add placeholders
  modalBody.innerHTML = `<div class="card text-center h-100" aria-hidden="true">
    <img src="${productImg1}" class="card-img-top" alt="...">
    <div class="card-body">
      <h5 class="card-title placeholder-glow">
        <a href="/p/${productId}">${productName}</a> <small class="text-muted">(${productId})</small>
        <a href="//t.me/RzkMarketBot?start=o_${sellerId}_p_${productId}" target="_blank" class="ps-1 text-decoration-none">
          <i class="bi bi-telegram"></i>
        </a>
        <span class="placeholder col-12"></span>
      </h5>
      <p class="card-text placeholder-glow">
        <span class="placeholder col-7"></span>
        <span class="placeholder col-4"></span>
        <span class="placeholder col-4"></span>
        <span class="placeholder col-6"></span>
        <span class="placeholder col-8"></span>
      </p>
      <a href="#" tabindex="-1" class="btn btn-primary disabled placeholder col-6"></a>
    </div>
  </div>`;
  // Button that triggered the modal
  const productRes = await fetch(`//localhost:5000/o/${sellerId}/p/${productId}`, {method: "POST"});
  const product = await productRes.json();
  console.log(product);
  // Update the modal"s content.
  // const modalTitle = exampleModal.querySelector(".modal-title");
  // modalTitle.textContent = product.name;
  // modalBodyInput.value = product.price;
  modalBody.innerHTML = `<div class="card text-center h-100">
        <a href="/p/${product.id}">
          <img src="${productImg1}" onerror="this.src = "//rzk.com.ru/icons/photo_error.svg";" class="card-img-top" alt="{{product.name}}">
        </a>
        <div class="card-body">
          <h6>
            <a href="/p/${product.id}">${product.name}</a> <small class="text-muted">(${product.id})</small>
            <a href="//t.me/RzkMarketBot?start=o_{{../object.id}}_p_{{product.id}}" target="_blank" class="ps-1 text-decoration-none">
              <i class="bi bi-telegram"></i>
            </a>
          </h6>
        </div>
        <div class="card-footer">
          <h6>${product.name} ${product.price}</h6>
          <div class="d-grid gap-2">
            <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#exampleModal"
            data-product-id="${product.id}"
            data-seller-id="${product.id}">Открыть</button>
          </div>
        </div>
      </div>`;
});

// modal cart
// helper round to 2 decimals
const roundNumber = (num) => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};
const cartAddModal = document.getElementById("cartAddModal");
if (cartAddModal) {
  const cartAddModalOpt = new Modal(cartAddModal);
  const addButton = document.getElementById("addToCart");
  const delButton = document.getElementById("deleteFromCart");
  const qtyInput = document.getElementById("qty");
  let button = {};
  cartAddModal.addEventListener("show.bs.modal", function(event) {
    // Button that triggered the modal
    button = event.relatedTarget;
    // Extract info from data-bs-* attributes
    // set default values
    qtyInput.value = "";
    delButton.classList.add("d-none");
    addButton.disabled = false;
    delButton.disabled = false;
    // Update the modal's content.
    const modalTitle = cartAddModal.querySelector(".modal-title");
    const modalUnit = cartAddModal.querySelector("#basic-addon2");
    modalTitle.textContent = `${button.getAttribute("data-bs-name")} (${button.getAttribute("data-bs-id")})`;
    modalUnit.textContent = button.getAttribute("data-bs-unit");
  });
  // focus qty input when modal shown
  cartAddModal.addEventListener("shown.bs.modal", function(event) {
    const productCartQty = + button.getAttribute("data-bs-qty");
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
      const productId = button.getAttribute("data-bs-id");
      const added = + button.getAttribute("data-bs-qty");
      const response = await fetch(`${form.action}/cart/add`, {
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
      const currencyName = addButton.getAttribute("data-bs-currencyName");
      if (qty) {
        button.innerText = `${qty} ${button.getAttribute("data-bs-unit")} ${roundNumber(qty * resJson.price)} ${currencyName}`;
        button.setAttribute("data-bs-qty", qty);
        button.classList.remove("btn-primary");
        button.classList.add("btn-success");
      } else {
        button.innerText = "Купить";
        button.classList.remove("btn-success");
        button.classList.add("btn-primary");
        button.removeAttribute("data-bs-qty");
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
      cartAddModalOpt.hide();
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
}
