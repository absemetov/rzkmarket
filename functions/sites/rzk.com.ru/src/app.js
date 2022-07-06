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
  // Button that triggered the modal
  const button = event.relatedTarget;
  // Extract info from data-bs-* attributes
  const productId = button.getAttribute("data-product-id");
  const productName = button.getAttribute("data-product-name");
  const sellerId = button.getAttribute("data-seller-id");
  const response1 = await fetch(`http://localhost:5000/o/${sellerId}/p/${productId}`, {
    method: "POST",
  });
  const currencies = await response1.json();
  console.log(currencies["USD"], currencies["EUR"]);
  // Update the modal"s content.
  const modalTitle = exampleModal.querySelector(".modal-title");
  const modalBodyInput = exampleModal.querySelector(".modal-body input");

  modalTitle.textContent = productName;
  modalBodyInput.value = productName;
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
