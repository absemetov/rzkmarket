import {autocomplete, getAlgoliaResults} from "@algolia/autocomplete-js";
import {createLocalStorageRecentSearchesPlugin} from "@algolia/autocomplete-plugin-recent-searches";
import {setInstantSearchUiState, getInstantSearchUiState, INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE} from "./instantsearch";
import {searchClient} from "./searchClient";
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
            item({item}) {
              return item.name;
            },
          },
        },
      ];
    },
  });
}
