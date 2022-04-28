import {autocomplete} from "@algolia/autocomplete-js";
import {
  debouncedSetInstantSearchUiState,
  getInstantSearchCurrentCategory,
  getInstantSearchUiState,
  getInstantSearchUrl,
  INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE,
  INSTANT_SEARCH_INDEX_NAME,
  setInstantSearchUiState,
} from "./instantsearch";

export function startAutocomplete() {
  autocomplete({
    container: "#autocomplete",
    placeholder: "Search for products",
    openOnFocus: true,
    detachedMediaQuery: "none",
    initialState: {
      query: searchPageState.query || "",
    },
    navigator: {
      navigate() {
        // We don't navigate to a new page because we leverage the InstantSearch
        // UI state API.
      },
    },
    onSubmit({state}) {
      setInstantSearchUiState({query: state.query});
    },
    onReset() {
      setInstantSearchUiState({
        query: "",
        hierarchicalMenu: {
          [INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE]: [],
        },
      });
    },
    onStateChange({prevState, state}) {
      if (prevState.query !== state.query) {
        debouncedSetInstantSearchUiState({query: state.query});
      }
    },
  });
}
