/* eslint-disable max-len */
import instantsearch from "instantsearch.js";
import {connectSearchBox,
  connectInfiniteHits,
  // connectHits,
  // connectPagination,
  connectHierarchicalMenu,
  connectRefinementList,
  // connectBreadcrumb,
  connectCurrentRefinements, connectStats} from "instantsearch.js/es/connectors";
import {poweredBy} from "instantsearch.js/es/widgets";
import historyRouter from "instantsearch.js/es/lib/routers/history";
import * as components from "instantsearch.js/es/helpers/components";
import {searchClient, devPrefix} from "./searchClient";
import {html, render} from "htm/preact";
const INSTANT_SEARCH_INDEX_NAME = `${devPrefix}products`;
import i18nContext from "./i18n";
const lang = document.getElementById("addToCart").dataset.lang;
const i18n = i18nContext[lang];

// export const INSTANT_SEARCH_HIERARCHICAL_ATTRIBUTE = "categories.lvl0";
function getCategorySlug(name) {
  return name.map(encodeURIComponent).join("/");
}

// Returns a name from the category slug.
// The "+" are replaced by spaces and other
// characters are decoded.
function getCategoryName(slug) {
  return slug.split("/").map(decodeURIComponent);
}

const instantSearchRouter = historyRouter({
  windowTitle({query, category, brand, subCategory}) {
    let title = "";
    if (query) {
      title = query;
    }
    if (category && category[0]) {
      title = `${title ? `${title} – ` : ""}${category[category.length - 1]}`;
      // document.getElementById("cat_header").innerHTML = category[category.length - 1] || "";
    } else {
      // document.getElementById("cat_header").innerHTML = "";
    }
    if (brand && brand[0]) {
      title = `${title ? `${title} – ` : ""}${brand.join(" – ")}`;
    }
    if (subCategory && subCategory[0]) {
      title = `${title ? `${title} – ` : ""}${subCategory.join(" – ")}`;
    }
    if (location.href.match(/^.*?\/search/)) {
      return title ? `${title} – ${i18n.a_search} – ${i18n.siteTitle}` : `${i18n.a_search} – ${i18n.siteTitle}`;
    }
  },
  createURL({qsModule, routeState, location}) {
    const urlParts = location.href.match(/^(.*?)\/search/);
    const baseUrl = `${urlParts ? urlParts[1] : ""}/`;
    const categoryPath = routeState.category ? `/${getCategorySlug(routeState.category)}` : "";
    const queryParameters = {};

    if (routeState.query) {
      queryParameters.query = encodeURIComponent(routeState.query);
    }
    // if (routeState.page !== 1) {
    //   queryParameters.page = routeState.page;
    // }
    if (routeState.brand) {
      queryParameters.brand = routeState.brand.map(encodeURIComponent);
    }
    if (routeState.seller) {
      queryParameters.seller = routeState.seller.map(encodeURIComponent);
    }
    if (routeState.subCategory) {
      queryParameters.subCategory = routeState.subCategory.map(encodeURIComponent);
    }

    const queryString = qsModule.stringify(queryParameters, {
      addQueryPrefix: true,
      arrayFormat: "comma",
      encodeValuesOnly: true,
    });
    return `${baseUrl}search${categoryPath}${queryString}`;
  },
  parseURL({qsModule, location}) {
    const pathnameMatches = location.pathname.match(/search\/(.*?)\/?$/);
    const category = getCategoryName(
        (pathnameMatches && pathnameMatches[1]) || "",
    );
    const {query = "", brand = [], subCategory = [], seller = []} = qsModule.parse(
        location.search.slice(1), {
          comma: true,
        },
    );
    // `qs` does not return an array when there's a single value.
    const allBrands = Array.isArray(brand) ? brand : [brand].filter(Boolean);
    const allSubCategories = Array.isArray(subCategory) ? subCategory : [subCategory].filter(Boolean);
    const allSellers = Array.isArray(seller) ? seller : [seller].filter(Boolean);
    return {
      query: decodeURIComponent(query),
      brand: allBrands.map(decodeURIComponent),
      subCategory: allSubCategories.map(decodeURIComponent),
      seller: allSellers.map(decodeURIComponent),
      category,
    };
  },
  cleanUrlOnDispose: true,
});

export const search = instantsearch({
  searchClient,
  indexName: INSTANT_SEARCH_INDEX_NAME,
  future: {
    preserveSharedStateOnUnmount: false,
  },
  insights: false,
  routing: {
    router: instantSearchRouter,
    stateMapping: {
      stateToRoute(uiState) {
        const indexUiState = uiState[INSTANT_SEARCH_INDEX_NAME] || {};
        return {
          query: indexUiState.query,
          // page: indexUiState.page,
          brand: indexUiState.refinementList && indexUiState.refinementList.brand,
          seller: indexUiState.refinementList && indexUiState.refinementList.seller,
          subCategory: indexUiState.refinementList && indexUiState.refinementList.subCategory,
          category: indexUiState.hierarchicalMenu && indexUiState.hierarchicalMenu["categories.lvl0"],
        };
      },
      routeToState(routeState) {
        return {
          [INSTANT_SEARCH_INDEX_NAME]: {
            query: routeState.query,
            // page: routeState.page,
            hierarchicalMenu: {
              "categories.lvl0": [routeState.category ? routeState.category.join(" > ") : ""],
            },
            refinementList: {
              brand: routeState.brand,
              subCategory: routeState.subCategory,
              seller: routeState.seller,
            },
          },
        };
      },
    },
  },
});
const virtualSearchBox = connectSearchBox((renderOptions, isFirstRender) => {
  // const {isSearchStalled} = renderOptions;
  // const loadingIndicator = document.querySelector("#loading-indicator");
  // const hitsPage = document.getElementById("hits");
  // hitsPage.hidden = isSearchStalled;
  // loadingIndicator.hidden = !isSearchStalled;
});
// proxy image
export const photoProxy = (src, locale) => {
  // proxy img for Crimea
  // return locale === "ru" ? src.replace("storage", "i0.wp.com/storage") : src;
  return src.replace("storage.googleapis.com", "i0.wp.com/storage.googleapis.com");
};

// Create the custom widget hits
// const customHits = connectHits(async (renderOptions, isFirstRender) => {
//   const {hits, widgetParams} = renderOptions;
//   // first clear
//   render("", widgetParams.container);
//   render(html`${hits.map(
//       (item) => html`<div class="col">
//        <div class="card text-center h-100">
//          <a href="/o/${item.sellerId}/p/${item.productId}">
//            <img src="${item.img1 ? photoProxy(item.img1) : "/icons/flower3.svg"}" onerror="this.onerror=null;this.src = '/icons/photo_error_${lang}.svg';" class="card-img-top" alt="${item.name}"/>
//          </a>
//          <div class="card-body">
//            ${item.brand ? html`<h6>${item.brandSite ? html`<a href="${item.brandSite}">${components.Highlight({attribute: "brand", hit: item})}</a>` : components.Highlight({attribute: "brand", hit: item})}</h6>` : ""}
//            <h6>
//              <a href="/o/${item.sellerId}/p/${item.productId}" class="link-dark link-underline-opacity-0">${components.Highlight({attribute: "name", hit: item})}</a> <small class="text-muted">(${components.Highlight({attribute: "productId", hit: item})})</small>
//            </h6>
//          </div>
//          <ul class="list-group list-group-flush">
//            <li class="list-group-item">
//              Склад: <a href="/o/${item.sellerId}" class="link-primary link-underline-opacity-0">${item.seller}</a>
//            </li>
//            <li class="list-group-item">
//              <a href="https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${i18n.bot_name}?start=${btoa(`o_${item.sellerId}_p_${item.productId}`)}`)}&text=${encodeURIComponent(`${item.seller} ${item.brand ? ` - ${item.brand} - ` : "-"} ${item.name}`)}" target="_blank">
//                <i class="bi bi-telegram"></i> Share
//              </a>
//            </li>
//          </ul>
//          <div class="card-footer">
//            <h3>${item.price} ${i18n.currency}</h3>
//            <div class="d-grid gap-2">
//             <button type="button" class="btn btn-success  ${item.availability ? "" : "disabled"}" data-bs-toggle="modal"
//               data-bs-target="#cartAddModal"
//               data-product-id="${item.productId}"
//               data-product-name="${item.name}"
//               data-product-unit="${item.unit}"
//               data-seller-id="${item.sellerId}"
//               data-seller="${item.seller}"
//               data-modal-close="true">${item.availability ? i18n.btn_buy : i18n.btnNotAvailable}</button>
//            </div>
//          </div>
//        </div>
//      </div>`,
//   )}`, widgetParams.container);
// });

// Infinity hits
const more = document.querySelector("#loading-indicator");
let lastRenderArgs;
const customInfinityHits = connectInfiniteHits((renderArgs, isFirstRender) => {
  const {hits, showMore, widgetParams} = renderArgs;
  const {container} = widgetParams;
  lastRenderArgs = renderArgs;
  more.classList.remove("d-none");
  if (isFirstRender) {
    // const sentinel = document.createElement("div");
    // container.appendChild(sentinel);
    const observer = new IntersectionObserver((entries) => {
      // entries.forEach((entry) => {
      //   if (entry.isIntersecting && !lastRenderArgs.isLastPage) {
      //     showMore();
      //     console.log("show more");
      //   }
      // });
      if (entries[0].intersectionRatio <= 0) return;
      if (lastRenderArgs.isLastPage) {
        more.classList.add("d-none");
      } else {
        showMore();
      }
    });
    observer.observe(more);
    return;
  }
  render("", container);
  render(html`${hits.map((item) => html`<div class="col"><div class="card text-center h-100">
       <a href="/o/${item.sellerId}/p/${item.productId}">
         <img src="${item.img1 ? photoProxy(item.img1) : "/icons/flower3.svg"}" onerror="this.onerror=null;this.src = '/icons/photo_error_${lang}.svg';" class="card-img-top" alt="${item.name}"/>
       </a>
       <div class="card-body">
         ${item.brand ? html`<h6>${item.brandSite ? html`<a href="${item.brandSite}">${components.Highlight({attribute: "brand", hit: item})}</a>` : components.Highlight({attribute: "brand", hit: item})}</h6>` : ""}
         <h6>
           <a href="/o/${item.sellerId}/p/${item.productId}" class="link-dark link-underline-opacity-0">${components.Highlight({attribute: "name", hit: item})}</a> <small class="text-muted">(${components.Highlight({attribute: "productId", hit: item})})</small>
         </h6>
       </div>
       <ul class="list-group list-group-flush">
         <li class="list-group-item">  
           Склад: <a href="/o/${item.sellerId}" class="link-primary link-underline-opacity-0">${item.seller}</a>
         </li>
         <li class="list-group-item">
           <a href="https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${i18n.bot_name}?start=${btoa(`o_${item.sellerId}_p_${item.productId}`)}`)}&text=${encodeURIComponent(`${item.seller} ${item.brand ? ` - ${item.brand} - ` : "-"} ${item.name}`)}" target="_blank">
             <i class="bi bi-telegram"></i> Share
           </a>
         </li>
       </ul>
       <div class="card-footer">
         <h3>${item.price} ${i18n.currency}</h3>
         <div class="d-grid gap-2">
          <button type="button" class="btn btn-success  ${item.availability ? "" : "disabled"}" data-bs-toggle="modal"
            data-bs-target="#cartAddModal"
            data-product-id="${item.productId}"
            data-product-name="${item.name}"
            data-product-unit="${item.unit}"
            data-seller-id="${item.sellerId}"
            data-seller="${item.seller}"
            data-modal-close="true">${item.availability ? i18n.btn_buy : i18n.btnNotAvailable}</button>
         </div>
       </div>
     </div>
    </div`)}`, container);
});

// Create the custom widget pagination
// const customPagination = connectPagination((renderOptions, isFirstRender) => {
//   const {
//     pages,
//     currentRefinement,
//     nbPages,
//     isFirstPage,
//     isLastPage,
//     refine,
//     createURL,
//   } = renderOptions;
//   const container = document.querySelector("#pagination");
//   if (nbPages <= 1) {
//     container.innerHTML = "";
//     return;
//   }
//   container.innerHTML = `
//     <ul class="pagination">
//       ${ !isFirstPage ?
//       `<li class="page-item">
//         <a class="page-link" href="${createURL(0)}" data-value="${0}" title="${i18n.a_pag_first}">
//           <i class="bi bi-chevron-bar-left"></i>
//         </a>
//       </li>
//       <li class="page-item">
//         <a class="page-link" href="${createURL(currentRefinement - 1)}" data-value="${currentRefinement - 1}" title="${i18n.a_pag_previous}">
//           <i class="bi bi-chevron-left"></i>
//         </a>
//       </li>` : `<li class="page-item disabled">
//         <a class="page-link " href="#">
//           <i class="bi bi-chevron-bar-left"></i>
//         </a>
//       </li>
//       <li class="page-item disabled">
//         <a class="page-link" href="#">
//           <i class="bi bi-chevron-left"></i>
//         </a>
//       </li>`}
//       <li class="d-inline d-md-none page-item">
//         <a class="page-link" href="${createURL(currentRefinement)}" data-value="${currentRefinement}">
//           ${i18n.t_pag_page} ${currentRefinement + 1} ${i18n.t_pag_of} ${nbPages}
//         </a>
//       </li>
//       ${pages.map((page) => `
//         <li class="d-none d-md-inline page-item ${currentRefinement === page ? "active" : ""}">
//           <a class="page-link" href="${createURL(page)}" data-value="${page}">
//             ${page + 1}
//           </a>
//         </li>`).join("")}
//         ${!isLastPage ?
//         `<li class="page-item">
//           <a class="page-link" href="${createURL(currentRefinement + 1)}" data-value="${currentRefinement + 1}" title="${i18n.a_pag_next}">
//             <i class="bi bi-chevron-right"></i>
//           </a>
//         </li>
//         <li class="page-item">
//           <a class="page-link" href="${createURL(nbPages - 1)}" data-value="${nbPages - 1}" title="${i18n.a_pag_last}">
//             <i class="bi bi-chevron-bar-right"></i>
//           </a>
//         </li>` :
//         `<li class="page-item disabled">
//           <a class="page-link" href="#">
//             <i class="bi bi-chevron-right"></i>
//           </a>
//         </li>
//         <li class="page-item disabled">
//           <a class="page-link" href="#">
//             <i class="bi bi-chevron-bar-right"></i>
//           </a>
//         </li>`}
//   </ul>`;
//   [...container.querySelectorAll("a")].forEach((element) => {
//     element.addEventListener("click", (event) => {
//       event.preventDefault();
//       refine(event.currentTarget.dataset.value);
//     });
//   });
// });

// create the render functions hierarchical-menu
const renderList = ({newitems, createURL}) => `
  ${newitems
      .map((item) => `
          <a href="${createURL(item.value)}" data-value="${item.value}"
            class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${item.isRefined ? "list-group-item-warning" : ""}">
            <div class="${item.isRefined ? "fw-bold" : ""}">  ${item.isRefined ? "<i class=\"bi bi-chevron-down\"></i>" : ""}
            ${item.label}</div> <span class="badge bg-success rounded-pill">${item.count}</span>
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
    div.classList.add("list-group", "list-group-flush", "pt-2");
    const button = document.createElement("button");
    button.classList.add("btn", "btn-success", "mt-2");
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
          <span class="badge bg-success rounded-pill">${item.count}</span>
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
  button.textContent = isShowingMore ? i18n.btn_ref_hide : i18n.btn_ref_show;
};

// create custom widget
const customRefinementList = connectRefinementList(
    renderRefinementList,
);

// connect breadcrumb
// render function
// const renderBreadcrumbItem = ({item, createURL}) => `
//     ${
//       item.value ? `
//         <li class="breadcrumb-item">
//         <a href="${createURL(item.value)}" data-value="${item.value}">
//           ${item.label}
//         </a></li>` : `<li class="breadcrumb-item active" aria-current="page">${item.label}</li>`}
// `;
// const renderBreadcrumbItem = (items, createURL) => {
//   const itemsList = [];
//   const breadcrumbCount = items.length;
//   for (const [index, item] of items.entries()) {
//     // show only last 2 items
//     if (index > 2) {
//       itemsList.push("<li class=\"breadcrumb-item d-block d-md-none\">...</li>");
//     }
//     if (item.value) {
//       itemsList.push(`<li class="breadcrumb-item ${breadcrumbCount - 3 > index ? "d-none d-md-inline" : ""}"><a href="${createURL(item.value)}" data-value="${item.value}" class="link-dark link-underline-opacity-0 link-underline-opacity-100-hover">${item.label}</a></li>`);
//     } else {
//       itemsList.push(`<li class="breadcrumb-item active" aria-current="page">${item.label}</li>`);
//     }
//   }
//   return itemsList.join("");
// };

// const renderBreadcrumb = (renderOptions, isFirstRender) => {
//   const {items, refine, createURL, widgetParams} = renderOptions;
//   // widgetParams.container.innerHTML = `
//   //   <ol class="breadcrumb">
//   //     <li class="breadcrumb-item">
//   //       <a href="/search"  id="home">${i18n.a_search}</a>
//   //     </li>
//   //     ${items.map((item) =>
//   //   renderBreadcrumbItem({
//   //     item,
//   //     createURL,
//   //   })).join("")}
//   //   </ol>
//   // `;
//   if (items.length) {
//     widgetParams.container.classList.remove("d-none");
//   } else {
//     widgetParams.container.classList.add("d-none");
//   }
//   widgetParams.container.innerHTML = `
//     <ol class="breadcrumb">
//       ${renderBreadcrumbItem(items, createURL)}
//     </ol>
//   `;

//   [...widgetParams.container.querySelectorAll("a")].forEach((element) => {
//     if (element.id !== "home") {
//       element.addEventListener("click", (event) => {
//         event.preventDefault();
//         refine(event.currentTarget.dataset.value);
//       });
//     }
//   });
// };

// Create the custom widget
// const customBreadcrumb = connectBreadcrumb(
//     renderBreadcrumb,
// );

// connect current refinements
// Create the render function
const createDataAttribtues = (refinement) =>
  Object.keys(refinement).map((key) => `data-${key}="${refinement[key]}"`).join(" ");

const renderListItem = (item) => `
  ${item.refinements.map((refinement) =>
    `<li class="nav-item"><span class="badge text-bg-success m-1">
      ${refinement.label} <button type="button" class="btn-close" aria-label="Close" ${createDataAttribtues(refinement)}></button>
    </span></li>`).join("")}
`;

const renderCurrentRefinements = (renderOptions, isFirstRender) => {
  const {items, refine, widgetParams} = renderOptions;
  items.length ? widgetParams.container.classList.add("mb-2") : widgetParams.container.classList.remove("mb-2");
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

// Create the render function Stats
const renderStats = (renderOptions, isFirstRender) => {
  const {
    nbHits,
    areHitsSorted,
    nbSortedHits,
    query,
    widgetParams,
  } = renderOptions;

  if (isFirstRender) {
    return;
  }

  let count = "";

  if (areHitsSorted) {
    if (nbSortedHits > 1) {
      count = `${nbSortedHits} relevant results`;
    } else if (nbSortedHits === 1) {
      count = "1 relevant result";
    } else {
      count = "No relevant result";
    }
    count += ` sorted out of ${nbHits}`;
  } else {
    if (nbHits >= 1) {
      // pluralize
      let pluralizeResult;
      if (nbHits % 10 === 1 && nbHits % 100 !== 11) {
        pluralizeResult = i18n.pluralize[0];
      } else {
        pluralizeResult = nbHits % 10 >= 2 && nbHits % 10 <= 4 && (nbHits % 100 < 10 || nbHits % 100 >= 20) ? i18n.pluralize[1] : i18n.pluralize[2];
      }
      count += `${i18n.searchFound} ${nbHits} ${pluralizeResult}`;
    } else {
      count += i18n.searchNotFound;
    }
  }
  query ? widgetParams.container.classList.add("mb-2") : widgetParams.container.classList.remove("mb-2");
  widgetParams.container.innerHTML = `
    ${query ? `<b><q>${query}</q> ${count}</b>` : ""}
  `;
};

// Create the custom widget
const customStats = connectStats(renderStats);

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
      "categories.lvl6",
    ],
    showParentLevel: false,
    sortBy: ["isRefined", "count:desc", "name:asc"],
  }),
  customInfinityHits({
    container: document.querySelector("#hits"),
    searchParameters: {
      hitsPerPage: 8,
    },
  }),
  // customPagination({
  //   container: document.querySelector("#pagination"),
  // }),
  customRefinementList({
    container: document.querySelector("#refinement-list-brand"),
    attribute: "brand",
    searchablePlaceholder: i18n.placehold_brand,
    showMore: true,
    limit: 5,
    showMoreLimit: 10,
  }),
  customRefinementList({
    container: document.querySelector("#refinement-list-subcategory"),
    attribute: "subCategory",
    searchablePlaceholder: i18n.placehold_cat,
    showMore: true,
    limit: 5,
    showMoreLimit: 10,
  }),
  customRefinementList({
    container: document.querySelector("#refinement-list-seller"),
    attribute: "seller",
    searchablePlaceholder: i18n.placehold_seller,
    showMore: true,
    limit: 5,
    showMoreLimit: 10,
  }),
  poweredBy({
    container: "#powered-by",
  }),
  // customBreadcrumb({
  //   container: document.querySelector("#breadcrumb"),
  //   attributes: [
  //     "categories.lvl0",
  //     "categories.lvl1",
  //     "categories.lvl2",
  //     "categories.lvl3",
  //     "categories.lvl4",
  //     "categories.lvl5",
  //   ],
  // }),
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
  customStats({
    container: document.querySelector("#stats"),
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
  // return (uiState && uiState[INSTANT_SEARCH_INDEX_NAME]) || {};
  return uiState || {};
}

// Return the InstantSearch index UI state.
export function searchPanel(visible) {
  if (!search.started) {
    search.start();
  }
  const searchPage = document.getElementById("search");
  const mainPage = document.getElementById("main");
  if (visible == "show") {
    // if (window.location.pathname !== "/search") {
    // history.pushState(null, "Search", "/search");
    // }
    mainPage.classList.add("d-none");
    searchPage.classList.remove("d-none");
  } else if (visible == "hide") {
    searchPage.classList.add("d-none");
    mainPage.classList.remove("d-none");
  }
}
