import instantsearch from "instantsearch.js";
import {connectSearchBox, connectHits, connectPagination} from "instantsearch.js/es/connectors";
import historyRouter from "instantsearch.js/es/lib/routers/history";
import {highlight} from "instantsearch.js/es/helpers";

import {searchClient} from "../src/searchClient";

export const INSTANT_SEARCH_INDEX_NAME = "products";
const instantSearchRouter = historyRouter();

export const search = instantsearch({
  searchClient,
  indexName: INSTANT_SEARCH_INDEX_NAME,
  routing: instantSearchRouter,
});
const virtualSearchBox = connectSearchBox(() => {});

// Create the render function
const renderHits = (renderOptions, isFirstRender) => {
  const {hits, widgetParams} = renderOptions;

  widgetParams.container.innerHTML = `
    ${hits
      .map(
          (item) =>
            `<div class="col">
              <div class="card text-center h-100">
                <div class="card-body">
                  <h6>${highlight({attribute: "name", hit: item})}</h6>
                </div>
              </div>
            </div>`,
      ).join("")}
  `;
};

// Create the custom widget
const customHits = connectHits(renderHits);

const renderPagination = (renderOptions, isFirstRender) => {
  const {
    pages,
    currentRefinement,
    nbPages,
    isFirstPage,
    isLastPage,
    refine,
    createURL,
  } = renderOptions;

  const container = document.querySelector("#pagination");

  container.innerHTML = `
    <ul class="pagination">
      ${
        !isFirstPage ?
          `
            <li class="page-item">
              <a class="page-link"
                href="${createURL(0)}"
                data-value="${0}"
              >
                First
              </a>
            </li>
            <li class="page-item">
              <a class="page-link"
                href="${createURL(currentRefinement - 1)}"
                data-value="${currentRefinement - 1}"
              >
                Previous
              </a>
            </li>
            ` :
          ""
}
      ${pages.map(
      (page) => `
        <li class="page-item ${currentRefinement === page ? "active" : ""}">
          <a class="page-link"
            href="${createURL(page)}"
            data-value="${page}"
          >
            ${page + 1}
          </a>
        </li>
      `,
  ).join("")}
        ${
          !isLastPage ?
            `
              <li class="page-item">
                <a class="page-link"
                  href="${createURL(currentRefinement + 1)}"
                  data-value="${currentRefinement + 1}"
                >
                  Next
                </a>
              </li>
              <li class="page-item">
                <a class="page-link"
                  href="${createURL(nbPages - 1)}"
                  data-value="${nbPages - 1}"
                >
                  Last
                </a>
              </li>
              ` : ""
}
    </ul>
  `;

  [...container.querySelectorAll("a")].forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      refine(event.currentTarget.dataset.value);
    });
  });
};

// Create the custom widget
const customPagination = connectPagination(
    renderPagination,
);

search.addWidgets([
  // Mount a virtual search box to manipulate InstantSearch"s `query` UI
  // state parameter.
  virtualSearchBox(),
  customHits({
    container: document.querySelector("#hits"),
  }),
  customPagination({
    container: document.querySelector("#pagination"),
  }),
]);

// Set the InstantSearch index UI state from external events.
export function setInstantSearchUiState(indexUiState) {
  search.setUiState((uiState) => ({
    ...uiState,
    [INSTANT_SEARCH_INDEX_NAME]: {
      ...uiState[INSTANT_SEARCH_INDEX_NAME],
      // We reset the page when the search state changes.
      page: 1,
      ...indexUiState,
    },
  }));
}

// Return the InstantSearch index UI state.
export function getInstantSearchUiState() {
  const uiState = instantSearchRouter.read();

  return (uiState && uiState[INSTANT_SEARCH_INDEX_NAME]) || {};
}
