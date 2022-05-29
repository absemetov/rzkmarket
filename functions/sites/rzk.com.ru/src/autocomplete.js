import {autocomplete, getAlgoliaResults} from "@algolia/autocomplete-js";
import {createLocalStorageRecentSearchesPlugin} from "@algolia/autocomplete-plugin-recent-searches";
import {setInstantSearchUiState, getInstantSearchUiState, INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE} from "./instantsearch";
import {searchClient} from "./searchClient";
import {highlight, snippet} from "instantsearch.js/es/helpers";
// recent search
const recentSearchesPlugin = createLocalStorageRecentSearchesPlugin({
  key: "instantsearch",
  limit: 3,
  transformSource({source}) {
    return {
      ...source,
      onSelect({setQuery, item}) {
        if (window.location.pathname == "/search") {
          setTimeout(() => {
            setQuery(item.label);
          }, 3);
          setInstantSearchUiState({
            query: item.label,
            hierarchicalMenu: {
              [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
            },
          });
        } else {
          window.location.href = "/search?products%5Bquery%5D=" + item.label;
        }
      },
    };
  },
});
// get searh query
const searchPageState = getInstantSearchUiState();

export function startAutocomplete() {
  autocomplete({
    debug: true,
    container: "#autocomplete",
    openOnFocus: true,
    placeholder: "Search",
    initialState: {
      query: searchPageState.query || "",
    },
    detachedMediaQuery: "(max-width: 991.98px)",
    plugins: [recentSearchesPlugin],
    onSubmit({state, setQuery}) {
      if (window.location.pathname == "/search") {
        setTimeout(() => {
          setQuery(state.query);
        }, 3);
        setInstantSearchUiState({
          query: state.query,
          hierarchicalMenu: {
            [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
          },
        });
      } else {
        window.location.href = "/search?products%5Bquery%5D=" + state.query;
      }
    },
    onReset() {
      if (window.location.pathname == "/search") {
        setInstantSearchUiState({
          query: "",
          hierarchicalMenu: {
            [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
          },
        });
      }
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
                    attributesToSnippet: ["name:10"],
                    snippetEllipsisText: "…",
                  },
                },
              ],
            });
          },
          onSelect({item, setQuery}) {
            recentSearchesPlugin.data.addItem({id: item.code, label: item.name});
            if (window.location.pathname !== "/search") {
              window.location.href = "/search?products%5Bquery%5D=" + item.name;
            } else {
              setTimeout(() => {
                setQuery(item.name);
              }, 3);
              setInstantSearchUiState({
                query: item.name,
                hierarchicalMenu: {
                  [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
                },
              });
            }
          },
          templates: {
            header() {
              return "Products";
            },
            item({item, html}) {
              return html`<div class="aa-ItemWrapper">
                <div class="aa-ItemContent">
                  <div class="aa-ItemIcon">
                    <img
                      src="${item.img}"
                      alt="${item.name}"
                      width="100"
                      height="100"
                    />
                  </div>
                  <div class="aa-ItemContentBody">
                    <div class="aa-ItemContentTitle">
                      ${highlight({hit: item, attribute: "name"})}
                    </div>
                    <div class="aa-ItemContentDescription">
                      ${snippet({hit: item, attribute: "description"})}
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
            recentSearchesPlugin.data.addItem({id: item.code, label: item.name});
            window.location.href = "/search?products%5Bquery%5D=" + item.name;
          },
          templates: {
            header() {
              return "Catalogs";
            },
            item({item, html}) {
              return html`<a class="aa-ItemLink" href="//rzk.com.ru">${item.name}</a>`;
            },
            footer() {
              return "Search by algolia";
            },
          },
        },
      ];
    },
  });
}
