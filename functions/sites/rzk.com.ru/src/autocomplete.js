import {autocomplete, getAlgoliaResults} from "@algolia/autocomplete-js";
import {createLocalStorageRecentSearchesPlugin} from "@algolia/autocomplete-plugin-recent-searches";
import {createQuerySuggestionsPlugin} from "@algolia/autocomplete-plugin-query-suggestions";
import {setInstantSearchUiState, getInstantSearchUiState, searchPanel, photoProxy} from "./instantsearch";
import {searchClient, devPrefix} from "./searchClient";
import i18nContext from "./i18n";
const lang = document.getElementById("addToCart").dataset.lang;
const i18n = i18nContext[lang];
// recent search
const recentSearchesPlugin = createLocalStorageRecentSearchesPlugin({
  key: "navbar",
  limit: 2,
  transformSource({source, onRemove}) {
    return {
      ...source,
      onSelect({item, setQuery}) {
        // for detachedmode use timer for set search input value
        // setTimeout(() => {
        //   setQuery(item.label);
        // }, 3);
        // if (document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0] && item.label && item.label.lenght > 5) {
        //   document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0].innerHTML = item.label.substring(0, 5) + "...";
        // }
        searchPanel("show");
        setInstantSearchUiState({query: item.label, hierarchicalMenu: {}, refinementList: {}});
      },
    };
  },
});
const querySuggestionsPlugin = createQuerySuggestionsPlugin({
  searchClient,
  indexName: `${devPrefix}query_suggestions`,
  getSearchParams() {
    return recentSearchesPlugin.data.getAlgoliaSearchParams({
      hitsPerPage: 4,
    });
  },
  transformSource({source, onRemove}) {
    return {
      ...source,
      onSelect({item, setQuery}) {
        // for detachedmode use timer for set search input value
        // setTimeout(() => {
        //   setQuery(item.query);
        // }, 3);
        // if (document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0]) {
        //   document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0].innerHTML = item.query.substring(0, 5) + "...";
        // }
        searchPanel("show");
        setInstantSearchUiState({query: item.query, hierarchicalMenu: {}, refinementList: {}});
      },
    };
  },
});
// get searh query
const searchPageState = getInstantSearchUiState();
// const imageOnErrorHandler = (event) => event.currentTarget.src = `/icons/photo_error_${lang}.svg`;

export function startAutocomplete() {
  return autocomplete({
    debug: false,
    container: "#autocomplete",
    openOnFocus: true,
    placeholder: i18n.placeholder_search,
    initialState: {
      query: searchPageState.query || "",
    },
    detachedMediaQuery: "(max-width: 991.98px)",
    plugins: [recentSearchesPlugin, querySuggestionsPlugin],
    onSubmit({state, setQuery}) {
      // for derachedmode save input value
      // setTimeout(() => {
      //   setQuery(state.query);
      // }, 3);
      // if (document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0] && state.query) {
      //   document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0].innerHTML = state.query.substring(0, 500) + "...";
      // }
      searchPanel("show");
      setInstantSearchUiState({query: state.query, hierarchicalMenu: {}, refinementList: {}});
    },
    onReset() {
      // if (document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0]) {
      //   document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0].innerHTML = i18n.placeholder_search;
      // }
      // searchPanel();
      // setInstantSearchUiState({query: "", hierarchicalMenu: {}, refinementList: {}});
    },
    getSources({query, setIsOpen}) {
      return [
        {
          sourceId: "products",
          getItems() {
            const params = {
              hitsPerPage: 5,
            };
            if (query && query.charAt(0) === "_") {
              query = query.substring(1);
              params.facets = ["seller"];
              params.facetFilters = [["seller:RZK Саки"]];
            }
            // load promo goods on initial state
            if (query !== "") {
              return getAlgoliaResults({
                searchClient,
                queries: [
                  {
                    indexName: `${devPrefix}products`,
                    query,
                    params: {
                      ...params,
                    },
                  },
                ],
              });
            } else {
              return [];
            }
          },
          onSelect({item, setQuery}) {
            recentSearchesPlugin.data.addItem({id: item.objectID, label: item.name});
            // for detachedmode use timer for set search input value
            // setTimeout(() => {
            //   setQuery(item.name);
            // }, 3);
            // if (document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0] && item.name && item.name.lenght > 5) {
            //   document.getElementsByClassName("aa-DetachedSearchButtonPlaceholder")[0].innerHTML = item.name.substring(0, 5) + "...";
            // }
            searchPanel("show");
            setInstantSearchUiState({query: item.name, hierarchicalMenu: {}, refinementList: {}});
          },
          getItemInputValue({item}) {
            return item.name;
          },
          templates: {
            header({html}) {
              return html`<span className="aa-SourceHeaderTitle">${i18n.a_products}</span>
                <div className="aa-SourceHeaderLine"/>`;
            },
            item({item, html, components}) {
              // return createElement(
              //     "div",
              //     null,
              //     createElement(
              //         "img",
              //         {class: "thumbnail", src: "/icons/flower3q.svg", onError: (event) => event.currentTarget.src = "/icons/flower3.svg"},
              //         null,
              //     ));
              const itemActionButtonOnClick = (event) => {
                event.stopPropagation();
                setIsOpen(false);
              };
              return html`<div class="aa-ItemWrapper">
                <div class="aa-ItemContent">
                  <div className="aa-ItemIcon aa-ItemIcon--picture aa-ItemIcon--alignTop">
                    <img
                      src="${item.img1 ? photoProxy(item.img1) : "/icons/flower3.svg"}"
                      onerror="${(event) => event.currentTarget.src = `/icons/photo_error_${lang}.svg`}"
                      alt="${item.name}"
                      class="${!item.img1 && "w-100"}"
                    />
                  </div>
                  <div class="aa-ItemContentBody">
                    <div class="aa-ItemContentTitle text-wrap">
                      ${components.Highlight({hit: item, attribute: "name"})} (${components.Highlight({hit: item, attribute: "productId"})}) ${item.brand ? components.Highlight({hit: item, attribute: "brand"}) : ""}
                    </div>
                    <b>${item.phone ? "от " : ""}${item.price} ${i18n.currency}${item.phone ? " за услугу" : ""}</b>
                  </div>
                </div>
                <div class="aa-ItemActions">
                  <button
                    class="aa-ItemActionButton aa-DesktopOnly aa-ActiveOnly"
                    type="button"
                    title="Select"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path
                        d="M18.984 6.984h2.016v6h-15.188l3.609 3.609-1.406 1.406-6-6 6-6 1.406 1.406-3.609 3.609h13.172v-4.031z"
                      />
                    </svg>
                  </button>
                  ${item.phone ? html`<a href="tel:+${item.phone}" class="aa-ItemActionButton me-2" style="font-size: 1.5rem; color: cornflowerblue;"><i class="bi bi-telephone"></i></a>` :
                  html`<button type="button" class="btn aa-ItemActionButton me-2 ${item.availability ? "" : "disabled"}" style="font-size: 1.5rem; color: cornflowerblue;" data-bs-toggle="modal" data-bs-target="#cartAddModal"
                  onClick="${itemActionButtonOnClick}"
                  data-autocomplete="true"
                  data-product-id="${item.productId}"
                  data-product-name="${item.name}"
                  data-product-unit="${item.unit}"
                  data-seller-id="${item.sellerId}"
                  data-seller="${item.seller}"
                  data-modal-close="true"><i class="bi bi-${item.availability ? "cart3" : "cart-x-fill"} text-success"></i></button>`}
                </div>
              </div>`;
            },
          },
        },
        {
          sourceId: "catalogs",
          getItems() {
            if (query !== "") {
              return getAlgoliaResults({
                searchClient,
                queries: [
                  {
                    indexName: `${devPrefix}catalogs`,
                    query,
                    params: {
                      hitsPerPage: 3,
                    },
                  },
                ],
              });
            } else {
              return [];
            }
          },
          onSelect({item, setQuery}) {
            searchPanel("show");
            setInstantSearchUiState({query: "", hierarchicalMenu: {"categories.lvl0": [item.hierarchicalUrl]}, refinementList: {}});
          },
          getItemInputValue({item}) {
            // return item.name;
          },
          templates: {
            header({html}) {
              return html`<span className="aa-SourceHeaderTitle">${i18n.a_catalogs}</span>
                <div className="aa-SourceHeaderLine"/>`;
            },
            item({item, html, components}) {
              return html`<div class="aa-ItemWrapper">
                <div class="aa-ItemContent">
                  <div class="aa-ItemIcon aa-ItemIcon--picture aa-ItemIcon--alignTop">
                    <img
                      src="${item.img1 ? photoProxy(item.img1) : "/icons/folder2.svg"}"
                      onerror="${(event) => event.currentTarget.src = `/icons/photo_error_${lang}.svg`}"
                      alt="${item.name}"
                      class="${!item.img1 && "w-100"}"
                    />
                  </div>
                  <div class="aa-ItemContentBody">
                    <div class="aa-ItemContentTitle text-wrap">
                      ${components.Highlight({hit: item, attribute: "name"})} (${components.Highlight({hit: item, attribute: "hierarchicalUrl"})})
                    </div>
                  </div>
                </div>
                <div class="aa-ItemActions">
                  <button
                    class="aa-ItemActionButton aa-DesktopOnly aa-ActiveOnly"
                    type="button"
                    title="Select"
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                      <path
                        d="M18.984 6.984h2.016v6h-15.188l3.609 3.609-1.406 1.406-6-6 6-6 1.406 1.406-3.609 3.609h13.172v-4.031z"
                      />
                    </svg>
                  </button>
                </div>
              </div>`;
            },
          },
        },
      ];
    },
  });
}
