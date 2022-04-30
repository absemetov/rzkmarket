import {autocomplete, getAlgoliaResults} from "@algolia/autocomplete-js";
import {setInstantSearchUiState, getInstantSearchUiState} from "./instantsearch";
import {searchClient} from "./searchClient";

const searchPageState = getInstantSearchUiState();

export function startAutocomplete() {
  autocomplete({
    container: "#autocomplete",
    placeholder: "Search for products",
    detachedMediaQuery: "none",
    initialState: {
      query: searchPageState.query || "",
    },
    onSubmit({state}) {
      setInstantSearchUiState({query: state.query});
    },
    onReset() {
      setInstantSearchUiState({query: ""});
    },
    onStateChange({prevState, state}) {
      if (prevState.query !== state.query) {
        setInstantSearchUiState({query: state.query});
      }
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
