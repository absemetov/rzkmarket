import {startAutocomplete} from "./autocomplete";
import {search} from "./instantsearch";
// Import custom plugins
import "bootstrap/js/dist/modal";
import "bootstrap/js/dist/offcanvas";

search.start();
startAutocomplete();
