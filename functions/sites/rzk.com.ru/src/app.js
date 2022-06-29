import {startAutocomplete} from "./autocomplete";
import {search, searchPanel} from "./instantsearch";
// Import custom plugins
import "bootstrap/js/dist/modal";
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
startAutocomplete();
