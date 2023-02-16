import {startAutocomplete} from "./autocomplete";
import {search, searchPanel, getInstantSearchUiState} from "./instantsearch";
// Import custom plugins
import Modal from "bootstrap/js/dist/modal";
import Toast from "bootstrap/js/dist/toast";
import "bootstrap/js/dist/offcanvas";
import "bootstrap/js/dist/collapse";
import "bootstrap/js/dist/dropdown";
import "bootstrap/js/dist/alert";
import "bootstrap/js/dist/carousel";
import SmartPhoto from "smartphoto";

import i18nContext from "./i18n";
const lang = document.getElementById("addToCart").dataset.lang;
const i18n = i18nContext[lang];

search.start();
const {setIsOpen} = startAutocomplete();

// document.getElementById("productModal").addEventListener("click", function(event, suggestion, dataset) {
//   setIsOpen(false);
// });

// document.getElementById("cartAddModal").addEventListener("click", function(event, suggestion, dataset) {
//   setIsOpen(true);
// });

const searchPageState = getInstantSearchUiState();
if (document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0] && searchPageState.query) {
  document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0].innerHTML = searchPageState.query.substring(0, 5) + "...";
}

search.on("render", () => {
  // window.location.pathname == "/search/"
  if (location.href.match(/^.*?\/search/)) {
    searchPanel("show");
  }
});

// back prev buttons trigger
window.addEventListener("popstate", function() {
  // window.location.pathname !== "/search/"
  if (!location.href.match(/^.*?\/search/)) {
    searchPanel("hide");
  }
});
// open modal algolia
const productModalEl = document.getElementById("productModal");
// const productModal = new Modal(productModalEl);
const addButton = document.getElementById("addToCart");
const currency = addButton.dataset.currency;
// btn show product
let buttonShowProduct;
// show info after add prod in button
let buttonAddProduct;
let hideByBuy = true;
// show autocomlete
productModalEl.addEventListener("hide.bs.modal", (event) => {
  hideByBuy = true;
});

productModalEl.addEventListener("hidden.bs.modal", (event) => {
  const fromAutocomlete = buttonShowProduct && buttonShowProduct.dataset.autocomplete;
  if (fromAutocomlete && hideByBuy) {
    setIsOpen(true);
  }
});

productModalEl.addEventListener("show.bs.modal", async (event) => {
  // Extract info from data-bs-* attributes
  buttonShowProduct = event.relatedTarget;
  const productId = buttonShowProduct.dataset.productId;
  const productName = buttonShowProduct.dataset.productName;
  const productBrand = buttonShowProduct.dataset.productBrand;
  const productImg2 = buttonShowProduct.dataset.productImg2;
  const sellerId = buttonShowProduct.dataset.sellerId;
  const seller = buttonShowProduct.dataset.seller;
  // add placeholders
  const modalBody = productModalEl.querySelector(".modal-body");
  // const modalFooter = productModalEl.querySelector(".modal-footer");
  modalBody.innerHTML = `<div class="card text-center h-100">
    <img src="${productImg2}" onerror="this.src = '/icons/photo_error_${lang}.svg';" class="card-img-top" alt="${productName}">
    <div class="card-body">
      <h6>
        <a href="/o/${sellerId}/p/${productId}">
        ${productBrand !== "undefined" ? `${productBrand} - ` : ""}${productName}</a> <small class="text-muted">(${productId})</small>
      </h6>
    </div>
    <div class="card-footer">
      <h3>
        <span class="placeholder">111</span> <small class="text-muted">${currency}</small>
      </h3>
      <div class="d-grid gap-2">
        <a href="#" tabindex="-1" class="btn btn-success disabled placeholder"></a>
        <a href="#" tabindex="-1" class="btn btn-success disabled placeholder mt-2"></a>
      </div>
    </div>
  </div>`;
  // get product data
  const productRes = await fetch(`/o/${sellerId}/p/${productId}`, {method: "POST"});
  // const productRes = await fetch(`https://rzk.com.ru/o/${sellerId}/p/${productId}`, {method: "POST"});
  const product = await productRes.json();
  if (!productRes.ok) {
    // throw new Error(resJson.error);
    alert(product.error);
    return false;
  }
  const cardFooter = productModalEl.querySelector(".card-footer");
  cardFooter.innerHTML = `
    <h3>
      ${product.price} <small class="text-muted">${currency}</small>
    </h3>
    <div class="d-grid gap-2">
    <button type="button" class="btn ${product.qty ? "btn-primary" : "btn-success"}" data-bs-toggle="modal"
      data-bs-target="#cartAddModal"
      data-product-id="${product.id}"
      data-product-name="${product.name}"
      data-product-unit="${product.unit}"
      data-product-qty="${product.qty ? product.qty : 0}"
      data-seller-id="${sellerId}"
      data-seller="${seller}"
      data-modal-close="true">
      ${product.qty ? product.qty + " " + product.unit + " " + product.sum + " " + currency : i18n.btn_buy}
    </button>
    <a href="/o/${sellerId}/cart"  class="btn btn-success position-relative mt-2" role="button">
      ${i18n.btn_cart} <strong id="totalSumNavAlg">${product.cartInfo.totalSum} ${currency}</strong>
      <span id="cartCountNavAlg" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-dark">
        ${product.cartInfo.cartCount}
        <span class="visually-hidden">count goods</span>
      </span>
    </a>
  </div>`;
});

// fullscreen
const fullscreen = document.getElementById("fullscreen");
fullscreen.addEventListener("click", (event) => {
  event.preventDefault();
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
// show algolia form when close
// cartAddModalEl.addEventListener("hide.bs.modal", function(event) {
//   if (buttonAddProduct.getAttribute("data-modal-close")) {
//     productModal.show();
//   }
// });

// show autocomlete
cartAddModalEl.addEventListener("hidden.bs.modal", (event) => {
  const fromAutocomlete = buttonShowProduct && buttonShowProduct.dataset.autocomplete;
  if (fromAutocomlete) {
    setIsOpen(true);
    // productModal.show();
  }
  buttonShowProduct = null;
});

cartAddModalEl.addEventListener("show.bs.modal", function(event) {
  hideByBuy = false;
  // Button that triggered the modal
  buttonAddProduct = event.relatedTarget;
  // Extract info from data-bs-* attributes
  // set default values
  qtyInput.value = "";
  delButton.classList.add("d-none");
  addButton.disabled = false;
  delButton.disabled = false;
  // Update the modal's content.
  const modalTitle = cartAddModalEl.querySelector(".modal-title");
  const modalUnit = cartAddModalEl.querySelector("#basic-addon2");
  modalTitle.textContent = `${buttonAddProduct.getAttribute("data-product-name")} (${buttonAddProduct.getAttribute("data-product-id")})`;
  modalUnit.textContent = buttonAddProduct.getAttribute("data-product-unit");
});
// focus qty input when modal shown
cartAddModalEl.addEventListener("shown.bs.modal", function(event) {
  const productCartQty = + buttonAddProduct.getAttribute("data-product-qty");
  if (productCartQty) {
    qtyInput.value = productCartQty;
    delButton.classList.remove("d-none");
  }
  qtyInput.focus();
  qtyInput.select();
});

// Toast ins
const toastLiveExample = document.getElementById("liveToast");
const toastSeller = toastLiveExample.querySelector("#toast-seller");
const toastBody = toastLiveExample.querySelector(".toast-body");

const toast = new Toast(toastLiveExample);

// add product to cart
const addToCartform = document.getElementById("addToCartForm");
addToCartform.addEventListener("submit", async (event) => {
  event.preventDefault();
  addButton.disabled = true;
  delButton.disabled = true;
  const qty = + qtyInput.value;
  const productId = buttonAddProduct.getAttribute("data-product-id");
  const added = + buttonAddProduct.getAttribute("data-product-qty");
  const sellerId = buttonAddProduct.getAttribute("data-seller-id");
  // const response = await fetch(`https://rzk.com.ru/o/${sellerId}/cart/add`, {
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
    return false;
  }
  // set toast header
  toastSeller.innerText = buttonAddProduct.dataset.seller;
  if (qty) {
    buttonAddProduct.innerHTML = `${qty} ${buttonAddProduct.dataset.productUnit} <span class="text-nowrap">${roundNumber(qty * resJson.price)} ${currency}</span>`;
    buttonAddProduct.setAttribute("data-product-qty", qty);
    buttonAddProduct.classList.remove("btn-success");
    buttonAddProduct.classList.add("btn-primary");
    // btn show add cart info
    if (buttonShowProduct && !buttonShowProduct.dataset.autocomplete) {
      buttonShowProduct.innerHTML = `${qty} ${buttonAddProduct.dataset.productUnit} <span class="text-nowrap">${roundNumber(qty * resJson.price)} ${currency}</span>`;
      buttonShowProduct.classList.remove("btn-success");
      buttonShowProduct.classList.add("btn-primary");
    }
    // toast info
    toastBody.innerHTML = `${buttonAddProduct.getAttribute("data-product-name")} (${buttonAddProduct.getAttribute("data-product-id")})
    <span class="text-nowrap fw-bold">${qty} ${buttonAddProduct.dataset.productUnit}</span> ${i18n.added_to_cart}
    <div class="mt-2 pt-2 border-top">
      <a href="/o/${sellerId}/cart" class="btn btn-success btn-sm" role="button">
        <i class="bi bi-cart3"></i> ${resJson.cartInfo.totalSum} ${currency} (${resJson.cartInfo.cartCount})
      </a>
    </div>`;
    // show toast
    toast.show();
  } else {
    buttonAddProduct.innerText = i18n.btn_buy;
    buttonAddProduct.classList.remove("btn-primary");
    buttonAddProduct.classList.add("btn-success");
    buttonAddProduct.removeAttribute("data-product-qty");
    // btn show
    if (buttonShowProduct && !buttonShowProduct.dataset.autocomplete) {
      buttonShowProduct.innerText = i18n.btn_show;
      buttonShowProduct.classList.remove("btn-primary");
      buttonShowProduct.classList.add("btn-success");
    }
    // toast
    if (added) {
      toastBody.innerHTML = `${buttonAddProduct.getAttribute("data-product-name")} (${buttonAddProduct.getAttribute("data-product-id")}) ${i18n.deleted_from_cart}
      <div class="mt-2 pt-2 border-top">
        <a href="/o/${sellerId}/cart" class="btn btn-success btn-sm" role="button">
          <i class="bi bi-cart3"></i> ${resJson.cartInfo.totalSum} ${currency} (${resJson.cartInfo.cartCount})
        </a>
      </div>`;
      // show toast
      toast.show();
    }
  }
  const cartCountNav = document.getElementById("cartCountNav");
  const totalSumNav = document.getElementById("totalSumNav");
  // total cart data
  const totalQty = document.getElementById("totalQty");
  const totalSum = document.getElementById("totalSum");
  if (totalQty) {
    totalQty.innerText = resJson.cartInfo.totalQty;
    totalSum.innerText = `${resJson.cartInfo.totalSum} ${currency}`;
  }
  // update algolia product
  const cartCountNavAlg = document.getElementById("cartCountNavAlg");
  const totalSumNavAlg = document.getElementById("totalSumNavAlg");
  if (cartCountNavAlg) {
    cartCountNavAlg.innerText = resJson.cartInfo.cartCount;
    totalSumNavAlg.innerText = `${resJson.cartInfo.totalSum} ${currency}`;
  }
  if (cartCountNav) {
    cartCountNav.innerText = resJson.cartInfo.cartCount;
    totalSumNav.innerText = `${resJson.cartInfo.totalSum} ${currency}`;
  }
  // hide modal
  cartAddModal.hide();
});
// delete product
delButton.addEventListener("click", async () => {
  qtyInput.value = "";
  addButton.click();
});

// purchase
const purchaseForm = document.getElementById("purchase");
if (purchaseForm) {
  const createOrderButton = document.getElementById("createOrderButton");
  // form submit
  purchaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    createOrderButton.disabled = true;
    const formData = new FormData(purchaseForm);
    // trim inputs
    const inputs = ["lastName", "firstName", "address", "comment"];
    inputs.forEach((input) => {
      formData.set(input, formData.get(input).trim());
    });
    const response = await fetch(purchaseForm.action, {
      method: "POST",
      body: formData,
    });
    const order = await response.json();
    if (response.ok) {
      // redirect to order page
      window.location.href = `/o/${order.objectId}/s/${order.orderId}`;
    } else {
      createOrderButton.disabled = false;
      for (const [key, error] of Object.entries(order.error)) {
        alert(`${key} => ${error}`);
        if (key === "carrierNumber") {
          document.getElementById(key).classList.add("is-invalid");
          document.getElementById(`${key}Feedback`).textContent = error[0];
          document.getElementById(key).addEventListener("focus", (event) => {
            event.target.classList.remove("is-invalid");
          });
        }
      }
    }
  });
  const option = document.getElementById("carrierId");
  if (+option.options[option.selectedIndex].getAttribute("data-bs-reqnumber")) {
    document.getElementById("carrierNumberDiv").classList.remove("d-none");
    document.getElementById("carrierNumber").required = true;
  } else {
    document.getElementById("carrierNumberDiv").classList.add("d-none");
    document.getElementById("carrierNumber").required = false;
  }
  document.getElementById("carrierId").addEventListener("change", (event) => {
    const option = event.target;
    if (+option.options[option.selectedIndex].getAttribute("data-bs-reqnumber")) {
      document.getElementById("carrierNumberDiv").classList.remove("d-none");
      document.getElementById("carrierNumber").required = true;
    } else {
      document.getElementById("carrierNumberDiv").classList.add("d-none");
      document.getElementById("carrierNumber").required = false;
    }
  });
}

// carousel
const myCarousel = document.getElementById("myCarousel");
if (myCarousel) {
  const totalSlides = document.querySelectorAll("#myCarousel .carousel-item").length;
  document.getElementById("totalSlides").innerHTML = totalSlides;
  myCarousel.addEventListener("slide.bs.carousel", (event) => {
    document.getElementById("activeSlide").innerHTML = event.to + 1;
    document.getElementById("totalSlides").innerHTML = totalSlides;
  });
}
