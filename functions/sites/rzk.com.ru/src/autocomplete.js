import {autocomplete, getAlgoliaResults} from "@algolia/autocomplete-js";
import {createLocalStorageRecentSearchesPlugin} from "@algolia/autocomplete-plugin-recent-searches";
import {setInstantSearchUiState, getInstantSearchUiState, INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE, getInstantSearchUrl} from "./instantsearch";
import {searchClient} from "./searchClient";

function onSelect({setIsOpen, setQuery, event, query}) {
  // You want to trigger the default browser behavior if the event is modified.
  // if (isModifierEvent(event)) {
  //   return;
  // }

  setQuery(query);
  setIsOpen(false);
  setInstantSearchUiState({query});
}

function getItemUrl({query}) {
  return getInstantSearchUrl({query});
}

function createItemWrapperTemplate({children, query, html}) {
  const uiState = {query};

  return html`<a
    class="aa-ItemLink"
    href="${getInstantSearchUrl(uiState)}"
  >
    ${children}
  </a>`;
}

const recentSearchesPlugin = createLocalStorageRecentSearchesPlugin({
  key: "instantsearch",
  limit: 3,
  transformSource({source}) {
    return {
      ...source,
      getItemUrl({item}) {
        return getItemUrl({
          query: item.label,
        });
      },
      onSelect({setIsOpen, setQuery, item, event}) {
        onSelect({
          setQuery,
          setIsOpen,
          event,
          query: item.label,
        });
      },
      // Update the default `item` template to wrap it with a link
      // and plug it to the InstantSearch router.
      templates: {
        ...source.templates,
        item(params) {
          const {children} = source.templates.item(params).props;

          return createItemWrapperTemplate({
            query: params.item.label,
            children,
            html: params.html,
          });
        },
      },
    };
  },
});

const searchPageState = getInstantSearchUiState();

export function startAutocomplete() {
  autocomplete({
    container: "#autocomplete",
    openOnFocus: true,
    placeholder: "Search for products",
    detachedMediaQuery: "none",
    initialState: {
      query: searchPageState.query || "",
    },
    // Add the recent searches plugin.
    plugins: [recentSearchesPlugin],
    onSubmit({state}) {
      setInstantSearchUiState({
        query: state.query,
        hierarchicalMenu: {
          [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
        },
      });
    },
    onReset() {
      setInstantSearchUiState({
        query: "",
        hierarchicalMenu: {
          [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
        },
      });
    },
    // onStateChange({prevState, state}) {
    //   if (prevState.query !== state.query) {
    //     setInstantSearchUiState({
    //       query: state.query,
    //       hierarchicalMenu: {
    //         [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
    //       },
    //     });
    //   }
    // },
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
          onSelect({setIsOpen, setQuery, item, event}) {
            onSelect({
              setQuery,
              setIsOpen,
              event,
              query: item.label,
            });
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
}
