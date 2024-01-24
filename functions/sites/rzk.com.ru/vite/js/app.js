// Import our custom CSS
import "../../scss/custom.scss";
import {startAutocomplete} from "../../src/autocomplete";
import {searchPanel, getInstantSearchUiState} from "../../src/instantsearch";
// Import custom plugins
import Modal from "bootstrap/js/dist/modal";
import Toast from "bootstrap/js/dist/toast";
import "bootstrap/js/dist/offcanvas";
import "bootstrap/js/dist/collapse";
import "bootstrap/js/dist/dropdown";
import "bootstrap/js/dist/alert";
import "bootstrap/js/dist/carousel";
import SmartPhoto from "smartphoto";

import i18nContext from "../../src/i18n";
const lang = document.getElementById("addToCart").dataset.lang;
const i18n = i18nContext[lang];
if (location.href.match(/^.*?\/search/)) {
  searchPanel("show");
}

// helper round to 2 decimals
const roundNumber = (num) => {
  // return Math.round((num + Number.EPSILON) * 100) / 100;
  return Math.round(num);
};

const {setIsOpen} = startAutocomplete();

const searchPageState = getInstantSearchUiState();
if (document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0] && searchPageState.query) {
  document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0].innerHTML = searchPageState.query.substring(0, 5) + "...";
}

// back prev buttons trigger
window.addEventListener("popstate", function() {
  // window.location.pathname !== "/search/"
  if (location.href.match(/^.*?\/search/)) {
    searchPanel("show");
  } else {
    searchPanel("hide");
  }
});
// open modal algolia
const productModalEl = document.getElementById("productModal");
// const productModal = new Modal(productModalEl);
const addButton = document.getElementById("addToCart");
// const currency = addButton.dataset.currency;
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

// instant search product show old!!!
productModalEl.addEventListener("show.bs.modal", async (event) => {
  // Extract info from data-bs-* attributes
  buttonShowProduct = event.relatedTarget;
  const productId = buttonShowProduct.dataset.productId;
  const productName = buttonShowProduct.dataset.productName;
  const productPrice = buttonShowProduct.dataset.productPrice;
  const productUnit = buttonShowProduct.dataset.productUnit;
  const productAvailability = buttonShowProduct.dataset.productAvailability;
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
        ${productBrand ? `${productBrand} - ` : ""}${productName}</a> <small class="text-muted">(${productId})</small>
      </h6>
    </div>
    <div class="card-footer">
      <h3>
        <span class="placeholder">111</span> ${i18n.currency}
      </h3>
      <div class="d-grid gap-2">
        <a href="#" tabindex="-1" class="btn btn-success disabled placeholder"></a>
        <a href="#" tabindex="-1" class="btn btn-success disabled placeholder mt-2"></a>
      </div>
    </div>
  </div>`;
  // get product data
  // const productRes = await fetch(`${localServer}/o/${sellerId}/p/${productId}`, {method: "POST"});
  // const productRes = await fetch(`https://rzk.com.ru/o/${sellerId}/p/${productId}`, {method: "POST"});
  // const product = await productRes.json();
  // if (!productRes.ok) {
  //   // throw new Error(resJson.error);
  //   alert(product.error);
  //   return false;
  // }
  const cardFooter = productModalEl.querySelector(".card-footer");
  cardFooter.innerHTML = `
    <h3>
      ${productPrice.toLocaleString("ru-Ru")} ${i18n.currency}
    </h3>
    <div class="d-grid gap-2">
    ${productAvailability ? `<button type="button" class="btn btn-success" data-bs-toggle="modal"
      data-bs-target="#cartAddModal"
      data-product-id="${productId}"
      data-product-name="${productName}"
      data-product-unit="${productUnit}"
      data-seller-id="${sellerId}"
      data-seller="${seller}"
      data-modal-close="true">${i18n.btn_buy}</button>` : `<button type="button" class="btn btn-success" disabled>${i18n.btnNotAvailable}</button>`}
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
const cartAddModalEl = document.getElementById("cartAddModal");
const cartAddModal = new Modal(cartAddModalEl);

const delButton = document.getElementById("deleteFromCart");
const qtyInput = document.getElementById("qty");

// show autocomlete
cartAddModalEl.addEventListener("hidden.bs.modal", (event) => {
  const fromAutocomlete = buttonShowProduct && buttonShowProduct.dataset.autocomplete;
  if (fromAutocomlete) {
    setIsOpen(true);
  }
  buttonShowProduct = null;
});

cartAddModalEl.addEventListener("show.bs.modal", function(event) {
  buttonShowProduct = event.relatedTarget;
  // hideByBuy = false;
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

// add product to cart New
const addToCartform = document.getElementById("addToCartForm");
addToCartform.addEventListener("submit", async (event) => {
  event.preventDefault();
  addButton.disabled = true;
  delButton.disabled = true;
  const qty = + qtyInput.value;
  const productId = buttonAddProduct.getAttribute("data-product-id");
  const added = + buttonAddProduct.getAttribute("data-product-qty");
  const objectId = buttonAddProduct.getAttribute("data-seller-id");
  // const server = "/cart/add";
  const response = await fetch("/cart/add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify({
      productId,
      qty,
      objectId,
    }),
  });
  const resJson = await response.json();
  if (!response.ok) {
    alert(resJson.error);
    addButton.disabled = false;
    delButton.disabled = false;
    return false;
  }
  if (!resJson.price) {
    alert(`Product ID ${productId} not found!`);
    return false;
  }
  // set toast header
  toastSeller.innerText = buttonAddProduct.dataset.seller;
  if (qty) {
    buttonAddProduct.innerHTML = `${qty} ${buttonAddProduct.dataset.productUnit} <span class="text-nowrap">${resJson.price ? roundNumber(qty * resJson.price).toLocaleString("ru-Ru") : "null"} ${i18n.currency}</span>`;
    buttonAddProduct.setAttribute("data-product-qty", qty);
    buttonAddProduct.classList.remove("btn-success");
    buttonAddProduct.classList.add("btn-primary");
    // btn show add cart info
    // if (buttonShowProduct && !buttonShowProduct.dataset.autocomplete) {
    //   buttonShowProduct.innerHTML = `${qty} ${buttonAddProduct.dataset.productUnit} <span class="text-nowrap">${resJson.price ? roundNumber(qty * resJson.price).toLocaleString("ru-Ru") : "null"} ${i18n.currency}</span>`;
    //   buttonShowProduct.classList.remove("btn-success");
    //   buttonShowProduct.classList.add("btn-primary");
    // }
    // toast info
    toastBody.innerHTML = `${buttonAddProduct.getAttribute("data-product-name")} (${buttonAddProduct.getAttribute("data-product-id")})
    <span class="text-nowrap fw-bold">${qty} ${buttonAddProduct.dataset.productUnit}</span> ${i18n.added_to_cart}
    <div class="mt-2 pt-2 border-top">
      <a href="/cart" class="btn btn-success btn-sm" role="button">
        <i class="bi bi-cart3"></i> ${i18n.btn_cart}
      </a>
    </div>`;
    // show toast
    toast.show();
  } else {
    buttonAddProduct.innerHTML = i18n.btn_buy;
    buttonAddProduct.classList.remove("btn-primary");
    buttonAddProduct.classList.add("btn-success");
    buttonAddProduct.removeAttribute("data-product-qty");
    // btn show
    // if (buttonShowProduct && !buttonShowProduct.dataset.autocomplete) {
    //   buttonShowProduct.innerText = i18n.btn_show;
    //   buttonShowProduct.classList.remove("btn-primary");
    //   buttonShowProduct.classList.add("btn-success");
    // }
    // toast
    if (added) {
      toastBody.innerHTML = `${buttonAddProduct.getAttribute("data-product-name")} (${buttonAddProduct.getAttribute("data-product-id")}) ${i18n.deleted_from_cart}
      <div class="mt-2 pt-2 border-top">
        <a href="/cart" class="btn btn-success btn-sm" role="button">
          <i class="bi bi-cart3"></i> ${i18n.btn_cart}
        </a>
      </div>`;
      // show toast
      toast.show();
    }
  }
  // total in Cart page
  const totalSum = document.getElementById("totalSum");
  if (totalSum) {
    totalSum.innerText = `${resJson.cartInfo.cartTotal.toLocaleString("ru-Ru")} ${i18n.currency}`;
  }
  // update count goods in navbar
  const cartCountNav = document.getElementById("cartCountNav");
  if (cartCountNav) {
    cartCountNav.innerText = resJson.cartInfo.cartCount;
    if (resJson.cartInfo.cartCount) {
      cartCountNav.classList.remove("d-none");
    } else {
      cartCountNav.classList.add("d-none");
    }
  }
  // hide modal
  cartAddModal.hide();
});

// delete product
delButton.addEventListener("click", async () => {
  qtyInput.value = "";
  addButton.click();
});

// purchase focus last name
const purchaseModal = document.getElementById("purchaseModal");
if (purchaseModal) {
  purchaseModal.addEventListener("shown.bs.modal", async (event) => {
    document.getElementById("lastName").focus();
  });
}

const purchaseForm = document.getElementById("purchase");

if (purchaseForm) {
  const purchaseModalIns = new Modal(purchaseModal);
  const createOrderButton = document.getElementById("createOrderButton");
  // delete white spaces in phone number
  document.getElementById("phoneNumber").addEventListener("blur", (event) => {
    event.target.value = event.target.value.replace(/\s/g, "");
  });
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
    const data = await response.json();
    if (response.ok) {
      // show success info
      let htmlLinks = "";
      for (const shareOrder of data.ordersInfo) {
        htmlLinks += `<h6><a href="/o/${shareOrder.objectId}/s/${shareOrder.orderId}" target="_blank">${i18n.shareOrder} #${shareOrder.orderNumber} склад ${shareOrder.objectName}</a></h6>`;
      }
      document.getElementById("cartContent").innerHTML = `<h3>${i18n.orderSuccess}</h3>${htmlLinks}`;
      document.getElementById("cartCountNav").classList.add("d-none");
      purchaseModalIns.hide();
    } else {
      createOrderButton.disabled = false;
      for (const [key, error] of Object.entries(data.error)) {
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
// const myCarousel = document.getElementById("myCarousel");
// if (myCarousel) {
//   const totalSlides = document.querySelectorAll("#myCarousel .carousel-item").length;
//   document.getElementById("totalSlides").innerHTML = totalSlides;
//   myCarousel.addEventListener("slide.bs.carousel", (event) => {
//     document.getElementById("activeSlide").innerHTML = event.to + 1;
//     document.getElementById("totalSlides").innerHTML = totalSlides;
//   });
// }

// infinity scroll
const more = document.querySelector(".more");
if (more) {
  const productsEl= document.getElementById("products");
  const nextLink = document.getElementById("nextLink");
  let nextURL = null;
  // set from dom when first load
  if (nextLink) {
    nextURL = nextLink.value;
  }
  // fetch products
  const getProducts = async (url) => {
    const response = await fetch(url);
    // handle 404
    if (!response.ok) {
      throw new Error(`An error occurred: ${response.status}`);
    }
    return await response.json();
  };
  // show the products
  const photoProxy = (src, locale) => {
    // proxy img for Crimea
    // return locale === "ru" ? src.replace("storage", "i0.wp.com/storage") : src;
    return src.replace("storage.googleapis.com", "i0.wp.com/storage.googleapis.com");
  };
  const showProducts = (products) => {
    products.forEach((product) => {
      const productEl = document.createElement("div");
      productEl.classList.add("col");
      productEl.innerHTML = `
           <div class="card text-center h-100">
            <a href="/o/${product.objectId}/p/${product.id}">
              <img src="${photoProxy(product.img1)}" onerror="this.onerror=null;this.src = '/icons/photo_error_${lang}.svg';" class="card-img-top" alt="${product.name}"/>
            </a>
            <div class="card-body">
              ${product.brand ? `<h4>${product.brand}</h4>` : ""}
              <h6>
                <a href="/o/${product.objectId}/p/${product.id}" class="link-dark link-underline-opacity-0">${product.name}</a> <small class="text-muted">(${product.id})</small>
              </h6>
            </div>
            <ul class="list-group list-group-flush">
              <li class="list-group-item">  
                <h6>Склад: <a href="/o/${product.objectId}" class="link-primary link-underline-opacity-0">${product.objectName}</a></h6>
              </li>
              <li class="list-group-item">
                <a href="https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${i18n.bot_name}?start=${btoa(`o_${product.objectId}_p_${product.id}`)}`)}` +
                `&text=${encodeURIComponent(`${product.objectName} ${product.brand ? ` - ${product.brand} - ` : "-"} ${product.name}`)}" target="_blank">
                  <i class="bi bi-telegram"></i> Share
                </a>
              </li>
            </ul>
            <div class="card-footer">
              <h3>${product.price} ${i18n.currency}</h3>
              <div class="d-grid gap-2">
                <button type="button" class="btn btn-success  ${product.availability ? "" : "disabled"}" data-bs-toggle="modal"
                  data-bs-target="#cartAddModal"
                  data-product-id="${product.id}"
                  data-product-name="${product.name}"
                  data-product-unit="${product.unit}"
                  data-seller-id="${product.objectId}"
                  data-seller="${product.objectName}"
                  data-modal-close="true">${product.availability ? i18n.btn_buy : i18n.btnNotAvailable}</button>
              </div>
            </div>
          </div>`;
      productsEl.appendChild(productEl);
    });
  };
  let notLoadingProd = true;
  // load products
  const loadProducts = async (url) => {
    try {
      // call the API to get quotes
      notLoadingProd = false;
      const response = await getProducts(url);
      notLoadingProd = true;
      // show products
      showProducts(response.products);
      nextURL = response.nextURL;
    } catch (error) {
      console.log(error.message);
    }
  };
  // load more
  const intersectionObserver = new IntersectionObserver(async (entries) => {
    if (entries[0].intersectionRatio <= 0) return;
    // load more content;
    if (nextURL && notLoadingProd) {
      await loadProducts(nextURL);
    }
    if (!nextURL) {
      more.classList.add("d-none");
    }
  });
  // start observing
  intersectionObserver.observe(more);
}
