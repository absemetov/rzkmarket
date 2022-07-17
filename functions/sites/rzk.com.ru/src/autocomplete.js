import {autocomplete, getAlgoliaResults} from "@algolia/autocomplete-js";
import {createLocalStorageRecentSearchesPlugin} from "@algolia/autocomplete-plugin-recent-searches";
import {createQuerySuggestionsPlugin} from "@algolia/autocomplete-plugin-query-suggestions";
import {setInstantSearchUiState, getInstantSearchUiState, INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE, searchPanel} from "./instantsearch";
import {searchClient} from "./searchClient";
// recent search
const recentSearchesPlugin = createLocalStorageRecentSearchesPlugin({
  key: "navbar",
  limit: 3,
  transformSource({source, onRemove}) {
    return {
      ...source,
      onSelect({item, setQuery}) {
        // for detachedmode use timer for set search input value
        setTimeout(() => {
          setQuery(item.label);
        }, 3);
        searchPanel("show");
        setInstantSearchUiState({
          query: item.label,
          hierarchicalMenu: {
            [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
          },
          refinementList: {
            brand: [],
            subCategory: [],
          },
        });
      },
    };
  },
});
const querySuggestionsPlugin = createQuerySuggestionsPlugin({
  searchClient,
  indexName: "instant_search_demo_query_suggestions",
  getSearchParams() {
    return recentSearchesPlugin.data.getAlgoliaSearchParams({
      hitsPerPage: 6,
    });
  },
  transformSource({source, onRemove}) {
    return {
      ...source,
      onSelect({item, setQuery}) {
        // for detachedmode use timer for set search input value
        setTimeout(() => {
          setQuery(item.query);
        }, 3);
        searchPanel("show");
        setInstantSearchUiState({
          query: item.query,
          hierarchicalMenu: {
            [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
          },
          refinementList: {
            brand: [],
            subCategory: [],
          },
        });
      },
    };
  },
});
// get searh query
const searchPageState = getInstantSearchUiState();

export function startAutocomplete() {
  autocomplete({
    debug: false,
    container: "#autocomplete",
    openOnFocus: true,
    placeholder: "Поиск",
    initialState: {
      query: searchPageState.query || "",
    },
    detachedMediaQuery: "(max-width: 991.98px)",
    plugins: [recentSearchesPlugin, querySuggestionsPlugin],
    onSubmit({state, setQuery}) {
      // for derachedmode save input value
      setTimeout(() => {
        setQuery(state.query);
      }, 3);
      searchPanel("show");
      setInstantSearchUiState({
        query: state.query,
        hierarchicalMenu: {
          [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
        },
        refinementList: {
          brand: [],
          subCategory: [],
        },
      });
    },
    onReset() {
      setInstantSearchUiState({
        query: "",
        hierarchicalMenu: {
          [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
        },
        refinementList: {
          brand: [],
          subCategory: [],
        },
      });
    },
    getSources({query}) {
      return [
        {
          sourceId: "products",
          getItems() {
            return getAlgoliaResults({
              searchClient,
              queries: [
                {
                  indexName: "products",
                  query,
                  params: {
                    hitsPerPage: 5,
                    attributesToSnippet: ["name:1"],
                    snippetEllipsisText: "…",
                  },
                },
              ],
            });
          },
          onSelect({item, setQuery}) {
            recentSearchesPlugin.data.addItem({id: item.objectID, label: item.name});
            // for detachedmode use timer for set search input value
            setTimeout(() => {
              setQuery(item.name);
            }, 3);
            searchPanel("show");
            setInstantSearchUiState({
              query: item.name,
              hierarchicalMenu: {
                [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
              },
              refinementList: {
                brand: [],
                subCategory: [],
              },
            });
          },
          getItemInputValue({item}) {
            return item.name;
          },
          templates: {
            header() {
              return "Products";
            },
            item({item, html, components}) {
              return html`<div class="aa-ItemWrapper">
                <div class="aa-ItemContent">
                  <div class="aa-ItemIcon">
                    <img
                      src="${item.img1 ? item.img1 : "/icons/flower3.svg"}"
                      alt="${item.name}"
                      width="100"
                      height="100"
                    />
                  </div>
                  <div class="aa-ItemContentBody">
                    <div class="aa-ItemContentTitle">
                      ${components.Highlight({hit: item, attribute: "name"})}
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
        {
          sourceId: "catalogs",
          getItems() {
            return getAlgoliaResults({
              searchClient,
              queries: [
                {
                  indexName: "dev_catalogs",
                  query,
                  params: {
                    hitsPerPage: 5,
                    attributesToSnippet: ["name:10"],
                    snippetEllipsisText: "…",
                  },
                },
              ],
            });
          },
          onSelect({item, setQuery}) {
            searchPanel("show");
            setInstantSearchUiState({
              query: "",
              hierarchicalMenu: {
                [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [item.hierarchicalUrl],
              },
              refinementList: {
                brand: [],
                subCategory: [],
              },
            });
          },
          getItemInputValue({item}) {
            // return item.name;
          },
          templates: {
            header() {
              return "Catalogs";
            },
            item({item, html, components}) {
              return html`<div class="aa-ItemWrapper">
                <div class="aa-ItemContent">
                  <div class="aa-ItemIcon">
                    <img
                      src="${item.img1 ? item.img1 : "/icons/folder2.svg"}"
                      alt="${item.name}"
                      width="100"
                      height="100"
                    />
                  </div>
                  <div class="aa-ItemContentBody">
                    <div class="aa-ItemContentTitle">
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
