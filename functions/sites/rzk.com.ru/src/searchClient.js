import algoliasearch from "algoliasearch/lite";
import i18n from "./i18n";

const lang = document.getElementById("addToCart").dataset.lang;
export const searchClient = algoliasearch(
    i18n[lang].ALGOLIA_ID,
    i18n[lang].ALGOLIA_SEARCH_KEY,
);
