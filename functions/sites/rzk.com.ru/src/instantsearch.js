import instantsearch from "instantsearch.js";
import {connectSearchBox, connectHits, connectPagination, connectHierarchicalMenu} from "instantsearch.js/es/connectors";
import historyRouter from "instantsearch.js/es/lib/routers/history";
import {highlight} from "instantsearch.js/es/helpers";
import {searchClient} from "../src/searchClient";

export const INSTANT_SEARCH_INDEX_NAME = "products";
export const INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE = "categories.lvl0";
const instantSearchRouter = historyRouter();

export const search = instantsearch({
  searchClient,
  indexName: INSTANT_SEARCH_INDEX_NAME,
  routing: {router: instantSearchRouter},
});
const virtualSearchBox = connectSearchBox(() => {});

// Create the render function for hits
const renderHits = (renderOptions, isFirstRender) => {
  const {hits, widgetParams} = renderOptions;

  widgetParams.container.innerHTML = `
    ${hits
      .map(
          (item) =>
            `<div class="col">
              <div class="card text-center h-100">
                <a href="/p/${item.objectID}">
                  <img src="${item.img1}" onerror="this.src = '//rzk.com.ru/icons/photo_error.svg';" class="card-img-top" alt="{{product.name}}">
                </a>
                <div class="card-body">
                  <h6>
                    <a href="/p/${item.objectID}">${highlight({attribute: "name", hit: item})}</a> <small class="text-muted">(${item.objectID})</small>
                    <a href="//t.me/RzkMarketBot?start=o_{{../object.id}}_p_{{product.id}}" target="_blank" class="ps-1 text-decoration-none">
                      tg
                    </a>
                  </h6>
                </div>
                <div class="card-footer">
                  <h3>
                    {{product.price}} <small class="text-muted">{{../currencyName}}</small>
                  </h3>
                  <div class="d-grid gap-2">
                    Купить
                  </div>
                </div>
              </div>
            </div>`,
      ).join("")}
  `;
};

// Create the custom widget hits
const customHits = connectHits(renderHits);

// render pagination
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

// Create the custom widget pagination
const customPagination = connectPagination(
    renderPagination,
);

// create the render functions hierarchical-menu
const renderList = ({newitems, createURL}) => `
  ${newitems
      .map(
          (item) => `
          <a href="${createURL(item.value)}" data-value="${item.value}" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${item.isRefined ? "list-group-item-primary" : ""}">
            ${item.label} <span data-value="${item.value}" class="badge bg-primary rounded-pill">${item.count}</span>
          </a>
          ${item.data ? renderList({newitems: item.data, createURL}) : ""}
        `,
      )
      .join("")}
`;

const renderHierarchicalMenu = (renderOptions, isFirstRender) => {
  const {
    items,
    refine,
    createURL,
    widgetParams,
  } = renderOptions;

  // if (isFirstRender) {
  //   const list = document.createElement("div");
  //   widgetParams.container.appendChild(list);
  // }
  // check items
  let newitems = [];
  for (const element of items) {
    if (element.isRefined) {
      newitems.push(element);
      break;
    }
  }
  if (!newitems.length) {
    newitems = items;
  }
  const children = renderList({newitems, createURL});
  widgetParams.container.innerHTML = children;
  [...widgetParams.container.querySelectorAll("a")].forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      refine(event.target.dataset.value);
    });
  });
};

// Create the custom widget hi
const customHierarchicalMenu = connectHierarchicalMenu(
    renderHierarchicalMenu,
);

search.addWidgets([
  // Mount a virtual search box to manipulate InstantSearch"s `query` UI
  // state parameter.
  virtualSearchBox(),
  customHierarchicalMenu({
    container: document.querySelector("#hierarchical-menu"),
    attributes: [
      "categories.lvl0",
      "categories.lvl1",
      "categories.lvl2",
      "categories.lvl3",
      "categories.lvl4",
    ],
    showParentLevel: false,
  }),
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

// Build URLs that InstantSearch understands.
export function getInstantSearchUrl(indexUiState) {
  return search.createURL({[INSTANT_SEARCH_INDEX_NAME]: indexUiState});
}

// Return the InstantSearch index UI state.
export function getInstantSearchUiState() {
  const uiState = instantSearchRouter.read();

  return (uiState && uiState[INSTANT_SEARCH_INDEX_NAME]) || {};
}

// Return the InstantSearch index UI state.
export function searchPanel(visible) {
  const searchPage = document.getElementById("search");
  const mainPage = document.getElementById("main");
  if (visible == "show") {
    if (window.location.pathname !== "/search") {
      history.pushState(null, "Search", "/search");
    }
    mainPage.classList.add("d-none");
    searchPage.classList.remove("d-none");
  } else if (visible == "hide") {
    searchPage.classList.add("d-none");
    mainPage.classList.remove("d-none");
  }
}
