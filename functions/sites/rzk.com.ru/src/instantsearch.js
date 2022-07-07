import instantsearch from "instantsearch.js";
import {connectSearchBox,
  connectHits,
  connectPagination,
  connectHierarchicalMenu,
  connectRefinementList,
  connectBreadcrumb,
  connectCurrentRefinements} from "instantsearch.js/es/connectors";
import {poweredBy} from "instantsearch.js/es/widgets";
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
const renderHits = async (renderOptions, isFirstRender) => {
  const {hits, widgetParams} = renderOptions;
  widgetParams.container.innerHTML = `
    ${hits
      .map(
          (item) =>
            `<div class="col">
              <div class="card text-center h-100">
                <a href="/p/${item.objectID}">
                  <img src="${item.img1 ? item.img1 : "//rzk.com.ru/icons/cart3.svg"}" onerror="this.src = "//rzk.com.ru/icons/photo_error.svg";" class="card-img-top" alt="{{product.name}}">
                </a>
                <div class="card-body">
                  <h6>
                    <a href="/p/${item.objectID}">${highlight({attribute: "name", hit: item})}</a> <small class="text-muted">(${item.objectID})</small>
                    <a href="//t.me/RzkMarketBot?start=o_{{../object.id}}_p_{{product.id}}" target="_blank" class="ps-1 text-decoration-none">
                      <i class="bi bi-telegram"></i>
                    </a>
                  </h6>
                </div>
                <div class="card-footer">
                  <h6>${item.seller} ${item.price}</h6>
                  <div class="d-grid gap-2">
                    <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#exampleModal"
                    data-product-id="${item.productId}"
                    data-product-name="${item.name}"
                    data-product-img1="${item.img1 ? item.img1 : "//rzk.com.ru/icons/cart3.svg"}"
                    data-seller-id="${item.sellerId}">Открыть</button>
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
      .map((item) => `
          <a href="${createURL(item.value)}" data-value="${item.value}"
            class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${item.isRefined ? "list-group-item-warning" : ""}">
            <div class="${item.isRefined ? "fw-bold" : ""}">  ${item.isRefined ? "<i class=\"bi bi-chevron-down\"></i>" : ""}
            ${item.label}</div> <span class="badge bg-primary rounded-pill">${item.count}</span>
          </a>
          ${item.data ? renderList({newitems: item.data, createURL}) : ""}
      `).join("")}
`;

const renderHierarchicalMenu = (renderOptions, isFirstRender) => {
  const {
    items,
    refine,
    createURL,
    widgetParams,
  } = renderOptions;

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
      refine(event.currentTarget.dataset.value);
    });
  });
};

// Create the custom widget hi
const customHierarchicalMenu = connectHierarchicalMenu(
    renderHierarchicalMenu,
);

// add refinementList
const renderRefinementList = (renderOptions, isFirstRender) => {
  const {
    items,
    isFromSearch,
    refine,
    createURL,
    isShowingMore,
    canToggleShowMore,
    searchForItems,
    toggleShowMore,
    widgetParams,
  } = renderOptions;

  if (isFirstRender) {
    const input = document.createElement("input");
    input.classList.add("form-control");
    input.placeholder = widgetParams.searchablePlaceholder;
    const div = document.createElement("div");
    div.classList.add("list-group");
    div.classList.add("list-group-flush");
    div.classList.add("pt-2");
    const button = document.createElement("button");
    button.classList.add("btn");
    button.classList.add("btn-info");
    button.textContent = "Show more";

    input.addEventListener("input", (event) => {
      searchForItems(event.currentTarget.value);
    });

    button.addEventListener("click", () => {
      toggleShowMore();
    });

    widgetParams.container.appendChild(input);
    widgetParams.container.appendChild(div);
    widgetParams.container.appendChild(button);
  }

  const input = widgetParams.container.querySelector("input");

  if (!isFromSearch && input.value) {
    input.value = "";
  }

  widgetParams.container.querySelector("div").innerHTML = items.length ? items
      .map((item) => `
        <a href="${createURL(item.value)}" data-value="${item.value}"
        class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
          <div>
            <i class="bi bi-${item.isRefined ? "check-square" : "square"}"></i> ${item.label}
          </div>
          <span class="badge bg-primary rounded-pill">${item.count}</span>
        </a>
        `).join("") : "No resalts";

  [...widgetParams.container.querySelectorAll("a")].forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      refine(event.currentTarget.dataset.value);
    });
  });

  const button = widgetParams.container.querySelector("button");

  // button.disabled = !canToggleShowMore;
  button.classList.add("d-none");
  if (canToggleShowMore) {
    button.classList.remove("d-none");
  }
  button.textContent = isShowingMore ? "Show less" : "Show more";
};

// create custom widget
const customRefinementList = connectRefinementList(
    renderRefinementList,
);

// connect breadcrumb
// render function
const renderBreadcrumbItem = ({item, createURL}) => `
    ${
      item.value ? `
        <li class="breadcrumb-item">
        <a href="${createURL(item.value)}" data-value="${item.value}">
          ${item.label}
        </a></li>` : `<li class="breadcrumb-item active" aria-current="page">${item.label}</li>`}
`;

const renderBreadcrumb = (renderOptions, isFirstRender) => {
  const {items, refine, createURL, widgetParams} = renderOptions;

  widgetParams.container.innerHTML = `
    <ol class="breadcrumb">
      <li class="breadcrumb-item">
        <a href="/search" data-value="default">Поиск</a>
      </li>
      ${items.map((item) =>
    renderBreadcrumbItem({
      item,
      createURL,
    })).join("")}
    </ol>
  `;

  [...widgetParams.container.querySelectorAll("a")].forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.currentTarget.dataset.value !== "default") {
        event.preventDefault();
      }
      refine(event.currentTarget.dataset.value);
    });
  });
};

// Create the custom widget
const customBreadcrumb = connectBreadcrumb(
    renderBreadcrumb,
);

// connect current refinements
// Create the render function
const createDataAttribtues = (refinement) =>
  Object.keys(refinement).map((key) => `data-${key}="${refinement[key]}"`).join(" ");

const renderListItem = (item) => `
  ${item.refinements.map((refinement) =>
    `<li class="nav-item"><span class="badge text-bg-success m-1">
      ${refinement.label} (${refinement.count}) <button type="button" class="btn-close" aria-label="Close" ${createDataAttribtues(refinement)}></button>
    </span></li>`).join("")}
`;

const renderCurrentRefinements = (renderOptions, isFirstRender) => {
  const {items, refine, widgetParams} = renderOptions;
  items.length ? widgetParams.container.classList.add("pb-2") : widgetParams.container.classList.remove("pb-2");
  widgetParams.container.innerHTML = `
    ${items.map(renderListItem).join("")}
  `;

  [...widgetParams.container.querySelectorAll("button")].forEach((element) => {
    element.addEventListener("click", (event) => {
      const item = Object.keys(event.currentTarget.dataset).reduce(
          (acc, key) => ({
            ...acc,
            [key]: event.currentTarget.dataset[key],
          }),
          {},
      );

      refine(item);
    });
  });
};

// Create the custom widget
const customCurrentRefinements = connectCurrentRefinements(
    renderCurrentRefinements,
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
      "categories.lvl5",
    ],
    showParentLevel: false,
  }),
  customHits({
    container: document.querySelector("#hits"),
  }),
  customPagination({
    container: document.querySelector("#pagination"),
  }),
  customRefinementList({
    container: document.querySelector("#refinement-list-brand"),
    attribute: "brand",
    searchablePlaceholder: "Search by brand",
    showMore: true,
    limit: 5,
    showMoreLimit: 10,
  }),
  customRefinementList({
    container: document.querySelector("#refinement-list-subcategory"),
    attribute: "subCategory",
    searchablePlaceholder: "Search by subCategory",
    showMore: true,
    limit: 5,
    showMoreLimit: 10,
  }),
  customRefinementList({
    container: document.querySelector("#refinement-list-seller"),
    attribute: "seller",
    searchablePlaceholder: "Search by seller",
    showMore: true,
    limit: 5,
    showMoreLimit: 10,
  }),
  poweredBy({
    container: "#powered-by",
  }),
  customBreadcrumb({
    container: document.querySelector("#breadcrumb"),
    attributes: [
      "categories.lvl0",
      "categories.lvl1",
      "categories.lvl2",
      "categories.lvl3",
      "categories.lvl4",
      "categories.lvl5",
    ],
  }),
  customCurrentRefinements({
    container: document.querySelector("#current-refinements"),
    excludedAttributes: [
      "categories.lvl0",
      "categories.lvl1",
      "categories.lvl2",
      "categories.lvl3",
      "categories.lvl4",
      "categories.lvl5",
      "query",
    ],
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
