import {startAutocomplete} from "./autocomplete";
import {search, searchPanel} from "./instantsearch";
// Import custom plugins
// Import all plugins
// eslint-disable-next-line no-unused-vars
import Modal from "bootstrap/js/dist/modal";
import "bootstrap/js/dist/offcanvas";
import "bootstrap/js/dist/collapse";

search.start();
search.on("render", () => {
  // Do something on render
  // const url = new URL(decodeURI(window.location.href));
  // const query = url.searchParams.get("products[query]");
  // const products = url.searchParams.get("products[hierarchicalMenu][categories.lvl0][0]");
  // if (products || query) {
  //   searchPanel("show");
  // }
  if (window.location.pathname == "/search") {
    searchPanel("show");
  }
});
window.addEventListener("popstate", function() {
  if (window.location.pathname !== "/search") {
    searchPanel("hide");
  }
});

// open modal
const exampleModal = document.getElementById("exampleModal");

exampleModal.addEventListener("show.bs.modal", (event) => {
  // Button that triggered the modal
  const button = event.relatedTarget;
  // Extract info from data-bs-* attributes
  const nameProduct = button.getAttribute("data-bs-whatever");
  // If necessary, you could initiate an AJAX request here
  // and then do the updating in a callback.
  //
  // Update the modal"s content.
  const modalTitle = exampleModal.querySelector(".modal-title");
  const modalBodyInput = exampleModal.querySelector(".modal-body input");

  modalTitle.textContent = `${nameProduct}`;
  modalBodyInput.value = nameProduct;
});

startAutocomplete();
