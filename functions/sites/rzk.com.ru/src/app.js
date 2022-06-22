import {startAutocomplete} from "./autocomplete";
import {search, showSearchPanel} from "./instantsearch";
// Import custom plugins
import "bootstrap/js/dist/modal";
import "bootstrap/js/dist/offcanvas";

search.start();
search.on("render", () => {
  // Do something on render
  const url = new URL(decodeURI(window.location.href));
  const query = url.searchParams.get("products[query]");
  const products = url.searchParams.get("products[hierarchicalMenu][categories.lvl0][0]");
  if (products || query) {
    showSearchPanel();
  }
});
startAutocomplete();
