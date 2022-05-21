import {autocomplete, getAlgoliaResults} from "@algolia/autocomplete-js";
import {createLocalStorageRecentSearchesPlugin} from "@algolia/autocomplete-plugin-recent-searches";
import {setInstantSearchUiState, getInstantSearchUiState, INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE} from "./instantsearch";
import {searchClient} from "./searchClient";

// function onSelect({setIsOpen, setQuery, event, query}) {
//   // You want to trigger the default browser behavior if the event is modified.
//   // if (isModifierEvent(event)) {
//   //   return;
//   // }

//   setQuery(query);
//   setIsOpen(false);
//   setInstantSearchUiState({query});
// }

// function getItemUrl({query}) {
//   return getInstantSearchUrl({query});
// }

// function createItemWrapperTemplate({children, query, html}) {
//   const uiState = {query};
//   return html`<a
//     class="aa-ItemLink"
//     href="${getItemUrl(uiState)}"
//   >
//     ${children}
//   </a>`;
// }

const recentSearchesPlugin = createLocalStorageRecentSearchesPlugin({
  key: "instantsearch",
  limit: 3,
  transformSource({source}) {
    return {
      ...source,
      // getItemUrl({item}) {
      // redirects
      // if (window.location.pathname !== "/search") {
      //   return "/search?" + item.label;
      // }
      // return getItemUrl({
      //   query: item.label,
      // });
      // },
      onSelect({setIsOpen, setQuery, item, event}) {
        // onSelect({
        //   setQuery,
        //   setIsOpen,
        //   event,
        //   query: item.label,
        // });
        if (window.location.pathname == "/search") {
          console.log(item.label);
          setQuery(item.label);
          // setInstantSearchUiState(item.label);
        } else {
          window.location.href = "/search?products%5Bquery%5D=" + item.label;
        }
      },
      // Update the default `item` template to wrap it with a link
      // and plug it to the InstantSearch router.
      // templates: {
      //   ...source.templates,
      //   item(params) {
      //     const {children} = source.templates.item(params).props;

      //     return createItemWrapperTemplate({
      //       query: params.item.label,
      //       children,
      //       html: params.html,
      //     });
      //   },
      // },
    };
  },
});

const searchPageState = getInstantSearchUiState();

export function startAutocomplete() {
  const {setIsOpen, setQuery} = autocomplete({
    container: "#autocomplete",
    openOnFocus: true,
    placeholder: "Search",
    initialState: {
      query: searchPageState.query || "",
    },
    // detachedMediaQuery: "",
    // Add the recent searches plugin.
    plugins: [recentSearchesPlugin],
    onSubmit({state}) {
      if (window.location.pathname == "/search") {
        setInstantSearchUiState({
          query: state.query,
          hierarchicalMenu: {
            [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
          },
        });
      } else {
        window.location.href = "/search?products%5Bquery%5D=" + state.query;
      }
      console.log("onSubmit");
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
    // shouldPanelOpen({state}) {
    //   const routeQuery = getInstantSearchUiState().query || "";
    //   if (!state.isOpen && routeQuery !== state.query) {
    //     console.log("state.query", state.query);
    //     console.log("routeQuery", routeQuery);
    //     state.query = routeQuery;
    //   }
    //   return true;
    // },
    onStateChange({prevState, state, setQuery}) {
      // if (window.location.pathname == "/search" && !state.query && !state.isOpen) {
      //   setQuery(getInstantSearchUiState().query || "");
      // }
      // if (window.location.pathname == "/search" && prevState.query !== state.query && state.isOpen) {
      //   setInstantSearchUiState({
      //     query: state.query,
      //     hierarchicalMenu: {
      //       [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
      //     },
      //   });
      // }
    },
    getSources({query}) {
      return [
        {
          sourceId: "links",
          getItems({query}) {
            return [
              {label: "Twitter", url: "https://twitter.com"},
              {label: "GitHub", url: "https://github.com"},
            ].filter(({label}) =>
              label.toLowerCase().includes(query.toLowerCase()));
          },
          getItemUrl({item}) {
            return item.url;
          },
          templates: {
            item({item}) {
              return `Result: ${item.label}`;
            },
          },
        },
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
          getItemInputValue({item}) {
            return item.name;
          },
          // getItemUrl({item}) {
          //   // redirects
          //   if (window.location.pathname !== "/search") {
          //     return "/search?" + item.name;
          //   }
          // },
          onSelect({item}) {
            recentSearchesPlugin.data.addItem({id: item.code, label: item.name});
            if (window.location.pathname !== "/search") {
              window.location.href = "/search?products%5Bquery%5D=" + item.name;
            } else {
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
              return `Result: ${item.name}`;
            },
          },
        },
      ];
    },
  });
  document.getElementById("aa").onclick = function() {
    setIsOpen(true);
    setQuery(getInstantSearchUiState().query || "");
  };
}
