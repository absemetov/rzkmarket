import algoliasearch from "algoliasearch/lite";
import i18n from "./i18n";

const addButton1 = document.getElementById("addToCart");
const lang = addButton1.getAttribute("data-lang");
export const searchClient = algoliasearch(
    i18n[lang].ALGOLIA_ID,
    i18n[lang].ALGOLIA_SEARCH_KEY,
);
