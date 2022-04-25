import algoliasearch from "algoliasearch/lite";
import instantsearch from "instantsearch.js";
import {searchBox, hits} from "instantsearch.js/es/widgets";

const searchClient = algoliasearch("YZIFWJVE7R", "a56bd432142fc9813846fa737167eeef");

const search = instantsearch({
  indexName: "products",
  searchClient,
});

search.addWidgets([
  searchBox({
    container: "#searchbox",
  }),

  hits({
    container: "#hits",
  }),
]);

search.start();
