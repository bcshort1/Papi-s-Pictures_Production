//Shared fetch wrapper that catches 401s and bounces the user back to the login page so individual handlers don't have to.
async function apiCall(url, options) {
    //Fire off the underlying fetch and wait for the response.
    var response = await fetch(url, options);
    //A 401 means the session is gone, so kick the user out and abort the rest of the call.
    if (response.status === 401) {
        //Send the browser to the login page.
        window.location.href = '/login';
        //Throw so the awaiting caller stops processing instead of trying to read a logged-out response.
        throw new Error('Session expired');
    }
    //Hand the response back to the caller for normal handling.
    return response;
}

//Escape HTML special characters so user-supplied strings can be safely inserted via innerHTML without opening up an XSS hole.
function escapeHtml(text) {
    //Null and undefined become empty strings so I don't render the literal word "undefined".
    if (!text) return '';
    //Use a throwaway div as the escape engine since the browser handles entity escaping for free via textContent.
    var div = document.createElement('div');
    //Setting textContent escapes the special characters automatically.
    div.textContent = String(text);
    //Read the now-escaped HTML back out of the div.
    return div.innerHTML;
}

//Shared reorder helpers used by the What's New, Services, and Media grids since they all share the same drag-and-drop and move-button mechanics.

//Persist the current card order to the server after a drag-and-drop or move-button action.
async function saveReorder(gridId, apiPath) {
    //Grab the grid element so I can read the current card order out of the DOM.
    var grid = document.getElementById(gridId);
    //Pull every card in the grid in their current DOM order.
    var cards = grid.querySelectorAll('.item-card');
    //Collect their IDs into a plain array I can ship to the server.
    var ids = [];

    //Walk the cards in order and stash each one's data-id on the array.
    for (const card of cards) {
        //Pull the database _id off the data-id attribute I set when the card was rendered.
        ids.push(card.getAttribute('data-id'));
    }
    try {
        //Send the new order to the reorder endpoint for whichever collection this grid represents.
        await apiCall('/api/' + apiPath + '/reorder', {
            //PUT since I'm updating the existing records' sortOrder.
            method: 'PUT',
            //JSON body, so set the matching Content-Type header.
            headers: { 'Content-Type': 'application/json' },
            //Wrap the IDs array in a body envelope and stringify it for transport.
            body: JSON.stringify({ ids: ids })
        });
    } catch (error) {
        //Network error or 401 redirect, surface a generic message so the user knows the order didn't stick.
        alert('Error saving order.');
    }
}

//Move a card up or down in the grid and persist the new order.
function moveCard(card, direction, gridId, apiPath) {
    //Grab the grid so I can manipulate the card's siblings.
    var grid = document.getElementById(gridId);
    //Up means swap with the previous sibling when one exists.
    if (direction === 'up' && card.previousElementSibling) {
        //Insert the card before its previous sibling, effectively bumping it up one slot.
        grid.insertBefore(card, card.previousElementSibling);
    //Down means swap with the next sibling when one exists.
    } else if (direction === 'down' && card.nextElementSibling) {
        //Insert the next sibling before the card, effectively bumping the card down one slot.
        grid.insertBefore(card.nextElementSibling, card);
    }
    //Refresh the sort badges so the displayed numbers match the new DOM order.
    updateSortBadges(gridId);
    //Persist the new order to the server.
    saveReorder(gridId, apiPath);
}

//Update the displayed sort order numbers on every card in a grid so they match the current DOM position.
function updateSortBadges(gridId) {
    //Grab the grid that holds the cards.
    var grid = document.getElementById(gridId);
    //Pull every card in the grid in their current DOM order.
    var cards = grid.querySelectorAll('.item-card');

    //Walk each card and update its sort badge with the 1-based position.
    for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
        //Find the meta-sort span inside this card.
        var sortSpan = cards[cardIndex].querySelector('.meta-sort');
        //If the badge exists, write the new 1-based sort number into it.
        if (sortSpan) sortSpan.textContent = 'Sort: ' + (cardIndex + 1);
    }
}

//Initialize SortableJS on a grid element for drag-and-drop reordering.
//Cache of active Sortable instances keyed by grid ID so I can tear them down and rebuild them when data reloads.
var sortableInstances = {};
function initSortable(gridId, apiPath) {
    //If I've already initialized this grid before, destroy the old instance so I don't stack duplicate handlers.
    if (sortableInstances[gridId]) {
        //Tear down the previous Sortable so the next new() call starts clean.
        sortableInstances[gridId].destroy();
    }
    //Grab the grid element I'm attaching Sortable to.
    var grid = document.getElementById(gridId);
    //Build a fresh Sortable on the grid and stash it in the cache so I can find it later.
    sortableInstances[gridId] = new Sortable(grid, {
        //200ms reorder animation so the swap feels smooth rather than jumpy.
        animation: 200,
        //Only the drag-handle element is grabbable, so accidental clicks elsewhere on the card don't start a drag.
        handle: '.drag-handle',
        //CSS classes Sortable applies during the various phases of a drag for styling.
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        //Fired once the drop is complete; sync the badges and persist the new order.
        onEnd: function () {
            //Refresh the sort badges so they match the new DOM order.
            updateSortBadges(gridId);
            //Persist the new order to the server.
            saveReorder(gridId, apiPath);
        }
    });
}

//Auth check that runs once at page load to confirm the user is signed in before showing any admin data.
(async function init() {
    try {
        //Hit the session endpoint to find out who's currently logged in.
        var response = await fetch('/api/session');
        //Parse the JSON response into a session object.
        var data = await response.json();
        //If the server says I'm not authenticated, bounce to the login page and bail out.
        if (!data.authenticated) {
            //Send the browser to the login page.
            window.location.href = '/login';
            //Stop the rest of init from running while the redirect is in flight.
            return;
        }
        //Show the logged-in username in the admin header.
        document.getElementById('adminUsername').textContent = data.username;
        //Show the account type next to the username so the user knows which role they're acting as.
        document.getElementById('adminAccountType').textContent = data.accountType;
        //Kick off the initial data loads for the three main grids.
        loadWhatsNew();
        loadServices();
        loadMedia();
    } catch (error) {
        //Network error or anything unexpected during the session check, default to bouncing to login.
        window.location.href = '/login';
    }
})();

//Logout button handler that destroys the server session then sends the user back to the public site.
document.getElementById('logoutBtn').addEventListener('click', async function () {
    //Hit the logout endpoint so the server destroys the session.
    await fetch('/api/logout', { method: 'POST' });
    //Send the user back to the public homepage.
    window.location.href = '/';
});

//Tab switching across the admin sections. Uses the data-tab attribute on each button to find its matching content panel.
//Cache the tab buttons and content panels once so I can iterate over them on every click.
var tabButtons = document.querySelectorAll('.tab-btn');
var tabContents = document.querySelectorAll('.tab-content');

//Wire each tab button up so clicking it activates that tab and reveals its content panel.
for (const button of tabButtons) {
    button.addEventListener('click', function () {
        //Read which tab this button belongs to from its data-tab attribute.
        var tab = this.getAttribute('data-tab');
        //Strip the active class off every tab button so only the clicked one ends up active.
        for (const tabButton of tabButtons) { tabButton.classList.remove('active'); }
        //Hide every content panel by stripping the active class off all of them.
        for (const content of tabContents) { content.classList.remove('active'); }
        //Mark the clicked button as active.
        this.classList.add('active');
        //Reveal the matching content panel by appending '-section' to the tab name.
        document.getElementById(tab + '-section').classList.add('active');

        //Lazily load the schema data the first time the schema tab is opened.
        if (tab === 'schema') {
            loadSchema();
        }
    });
}


//Modal references and helpers, used by every CRUD flow on the page.
//Outer overlay element that dims the page when the modal is open.
var modal = document.getElementById('modal');
//Title bar text node I set with each open call.
var modalTitle = document.getElementById('modalTitle');
//Container the per-entity field inputs are appended into.
var modalFields = document.getElementById('modalFields');
//The form element itself, used to attach the shared submit listener.
var modalForm = document.getElementById('modalForm');

//Track which entity type and record ID the modal is currently editing. ID is null for new records.
var currentEditType = null;
var currentEditId = null;
//True while runBatchEntry has its own handleSave attached to the modal form. The global submit
//handler bails out when this is set so the batch handler is the sole submitter — without this
//guard both handlers fire on submit and send two PUTs to the same record, racing against each
//other and producing "source missing" rename warnings on the second.
var batchEntryActive = false;

//Show the modal with the given title text.
function openModal(title) {
    //Update the title so the user knows whether they're adding or editing.
    modalTitle.textContent = title;
    //Switch display to flex so the modal appears centered.
    modal.style.display = 'flex';
}

//Hide the modal and clear its state.
function closeModal() {
    //Hide the overlay.
    modal.style.display = 'none';
    //Clear the previously rendered field inputs so the next open starts fresh.
    modalFields.innerHTML = '';
    //Reset the edit type so I don't accidentally route the next submit to the wrong endpoint.
    currentEditType = null;
    //Reset the edit ID so the next submit is treated as a create unless overridden.
    currentEditId = null;
}

//Close the modal when the X or Cancel button is clicked.
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

//Close the modal when the user clicks the dimmed background outside the modal content.
modal.addEventListener('click', function (event) {
    //Only treat a click on the overlay itself as a close, not bubbled clicks from inside the modal content.
    if (event.target === modal) closeModal();
});

//Close the modal when the user presses Escape, but only if the modal is actually open.
document.addEventListener('keydown', function (event) {
    //Escape key plus visible modal means close.
    if (event.key === 'Escape' && modal.style.display === 'flex') closeModal();
});

//Form Field Helpers

//Create a form field group (label + input/textarea/select) and return the container div. Supports text, number, date, textarea, and checkbox types.
function createField(label, name, type, value, required) {
    //Create the wrapper div that holds the label and input together as one form group.
    var group = document.createElement('div');
    //Apply the standard form-group class so the field picks up the shared form styling.
    group.className = 'form-group';

    //For checkboxes, use a horizontal layout with the checkbox before the label.
    if (type === 'checkbox') {
        //Swap to the checkbox-specific class so the checkbox sits inline with its label rather than stacked.
        group.className = 'form-group checkbox-group';
        //Build the actual checkbox input element.
        var input = document.createElement('input');
        //Set the input type to checkbox so the browser renders it as a tickbox.
        input.type = 'checkbox';
        //Give the input a predictable ID so the label's for attribute can target it.
        input.id = 'field-' + name;
        //Set the name so the value gets included when the form is read via FormData.
        input.name = name;
        //Coerce the incoming value to a boolean so the checkbox starts in the right state.
        input.checked = Boolean(value);
        //Drop the checkbox into the group first so it appears to the left of the label.
        group.appendChild(input);

        //Build the label that sits next to the checkbox.
        var labelEl = document.createElement('label');
        //Wire the label up to the checkbox via the for attribute so clicking the label toggles it.
        labelEl.setAttribute('for', 'field-' + name);
        //Set the visible label text from the caller's label argument.
        labelEl.textContent = label;
        //Append the label after the checkbox to complete the inline layout.
        group.appendChild(labelEl);
        //Hand the finished checkbox group back to the caller, skipping the rest of the function.
        return group;
    }

    //For non-checkbox fields, build the label first so it sits above the input.
    var labelEl = document.createElement('label');
    //Connect the label to the input via the for attribute for accessibility.
    labelEl.setAttribute('for', 'field-' + name);
    //Show the human-readable label text the caller passed in.
    labelEl.textContent = label;
    //Add the label to the group container.
    group.appendChild(labelEl);

    //Declare the input variable here so it's available in both branches of the type check below.
    var input;
    if (type === 'textarea') {
        //For multi-line fields, build a textarea instead of a regular input.
        input = document.createElement('textarea');
    } else {
        //For everything else (text, number, date, datetime-local, etc.) build a standard input.
        input = document.createElement('input');
        //Set the input type to whatever the caller asked for so the browser picks the right widget.
        input.type = type;
        if (type === 'number') {
            //Allow decimal values for number inputs so prices like 29.99 are accepted.
            input.step = 'any';
        }
        if (type === 'datetime-local') {
            //Show the seconds field; without this the input silently drops seconds
            //on save which then triggers a phantom file rename on the next edit.
            input.step = '1';
        }
    }
    //Give the input a predictable ID so labels and helper code can find it.
    input.id = 'field-' + name;
    //Set the form field name so the value comes through when the form is serialized.
    input.name = name;
    if (value !== undefined && value !== null) {
        //Pre-fill the input with the existing value when one was supplied.
        input.value = value;
    }
    //Mark the field as required so the browser blocks submission when it's empty.
    if (required) input.required = true;
    //Drop the finished input into the group below the label.
    group.appendChild(input);

    //Add helper text for datetime-local fields so users know they can enter a date.
    if (type === 'datetime-local') {
        var hint = document.createElement('small');
        hint.className = 'field-hint';
        hint.textContent = value ? 'Auto-detected from file metadata. Edit if needed.' : 'Enter the date and time the media was captured.';
        group.appendChild(hint);
    }

    return group;
}

// What's New CRUD

//Fetch all What's New items from the API and render them as cards in the grid. Initializes drag-and-drop after rendering.
async function loadWhatsNew() {
    //Grab the grid container that all the rendered item cards will be inserted into.
    var grid = document.getElementById('whatsNewGrid');
    try {
        //Hit the API to pull down the current list of What's New items.
        var response = await apiCall('/api/whats-new');
        //Parse the JSON body into a JavaScript array of item objects.
        var items = await response.json();
        //Wipe whatever was in the grid before so I can rebuild it from scratch.
        grid.innerHTML = '';

        //If there are no items in the database, show a friendly empty state and bail out early.
        if (items.length === 0) {
            grid.innerHTML = '<p class="loading-text">No items found. Click "+ Add New Item" to create one.</p>';
            return;
        }

        //Iterate over each What's New item and create a card element to display it in the grid. Each card includes a drag handle, move buttons, ID badges, title, description, metadata, and Edit/Delete action buttons.
        for (let index = 0; index < items.length; index++) {
            //Pull the current item out of the array so I can reference it inside the loop.
            let item = items[index];
            //Create the card div that will hold all of this item's UI elements.
            let card = document.createElement('div');
            //Apply the shared item-card class so the card picks up the standard card styling.
            card.className = 'item-card';
            //Stash the database _id on the DOM node so reorder logic can read it back out later.
            card.setAttribute('data-id', item._id);

            //Format the date for display using UTC getters to avoid timezone shift.
            var dateStr = 'No date';
            if (item.date) {
                var d = new Date(item.date);
                var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                dateStr = monthNames[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
            }

            //Build the card HTML with drag handle, move buttons, product IDs, title, description, metadata, and action buttons.
            //Build the entire card markup as a single string concatenation. Each fragment below is one piece of the rendered card.
            card.innerHTML =
                //Top reorder bar that holds the drag handle and the up/down buttons.
                '<div class="card-reorder-bar">' +
                //Three-line hamburger glyph used as the drag handle.
                '<span class="drag-handle" title="Drag to reorder">&#9776;</span>' +
                //Wrapper for the up/down move buttons so they sit together.
                '<div class="move-buttons">' +
                //Up arrow button bumps the card one slot earlier.
                '<button class="move-btn move-up-btn" title="Move up">&#9650;</button>' +
                //Down arrow button bumps the card one slot later.
                '<button class="move-btn move-down-btn" title="Move down">&#9660;</button>' +
                //Close the move-buttons wrapper.
                '</div>' +
                //Close the reorder bar.
                '</div>' +
                //ID badges row showing the database _id and any legacy product ID.
                '<div class="card-ids">' +
                //Render the Mongo _id badge so curators can match cards to database records.
                '<span class="id-badge"><strong>_id:</strong> ' + escapeHtml(item._id) + '</span>' +
                //Conditionally render the legacy Product ID badge if this record carries one.
                (item.legacyId !== undefined ? '<span class="id-badge"><strong>Product ID:</strong> ' + escapeHtml(String(item.legacyId)) + '</span>' : '') +
                //Close the ID badges row.
                '</div>' +
                //Item title heading, falling back to a placeholder if the item has none.
                '<h3>' + escapeHtml(item.title || 'Untitled') + '</h3>' +
                //Item description paragraph.
                '<p class="card-description">' + escapeHtml(item.description || '') + '</p>' +
                //Meta strip below the description that holds date, tag, status, and sort badges.
                '<div class="card-meta">' +
                //Formatted date badge using the dateStr built above.
                '<span class="meta-date">' + escapeHtml(dateStr) + '</span>' +
                //Optional tag badge, only rendered when a tag exists.
                (item.tag ? '<span class="meta-tag">' + escapeHtml(item.tag) + '</span>' : '') +
                //Visibility badge whose CSS class swaps on the display flag.
                '<span class="meta-status ' + (item.display ? 'active' : 'inactive') + '">' +
                //Visibility badge text.
                (item.display ? 'Visible' : 'Hidden') + '</span>' +
                //Sort order badge showing the 1-based DOM position.
                '<span class="meta-sort">Sort: ' + (index + 1) + '</span>' +
                //Close the meta strip.
                '</div>' +
                //Action button row at the bottom of the card.
                '<div class="card-actions">' +
                //Edit button opens the modal pre-filled with this item's values.
                '<button class="edit-btn">Edit</button>' +
                //Delete button kicks off the delete-with-confirm flow.
                '<button class="delete-btn">Delete</button>' +
                //Close the action row.
                '</div>';

            //Wire the move buttons up to the shared moveCard helper. Each one passes the direction and grid info.
            card.querySelector('.move-up-btn').addEventListener('click', function () {
                //Move this card one slot earlier in the What's New grid.
                moveCard(card, 'up', 'whatsNewGrid', 'whats-new');
            });
            card.querySelector('.move-down-btn').addEventListener('click', function () {
                //Move this card one slot later in the What's New grid.
                moveCard(card, 'down', 'whatsNewGrid', 'whats-new');
            });
            //Edit click pops the modal open pre-populated with this item.
            card.querySelector('.edit-btn').addEventListener('click', function () {
                //Defer to editWhatsNew which handles the field setup.
                editWhatsNew(item);
            });
            //Delete click hands off to deleteWhatsNew which prompts and DELETEs.
            card.querySelector('.delete-btn').addEventListener('click', function () {
                //Pass both ID and title so the confirm prompt can show a friendly name.
                deleteWhatsNew(item._id, item.title);
            });

            grid.appendChild(card);
        }

        //Initialize drag-and-drop on the grid.
        initSortable('whatsNewGrid', 'whats-new');
    } catch (error) {
        grid.innerHTML = '<p class="loading-text">Failed to load items.</p>';
    }
}

//Open the Add What's New Item modal with empty fields.
document.getElementById('addWhatsNewBtn').addEventListener('click', function () {
    //Tell the shared modal logic that I'm working with a What's New record so the submit handler picks the right endpoint.
    currentEditType = 'whats-new';
    //Null out the edit ID since this is a brand new item, not an edit of an existing one.
    currentEditId = null;

    //Clear out any leftover fields from a previous modal session so I start with a blank form.
    modalFields.innerHTML = '';
    //Add the title input as a required text field.
    modalFields.appendChild(createField('Title', 'title', 'text', '', true));
    //Add the description as a required multi-line textarea.
    modalFields.appendChild(createField('Description', 'description', 'textarea', '', true));
    //Add the date field, defaulting to today so the user doesn't have to type it themselves.
    modalFields.appendChild(createField('Date', 'date', 'date', new Date().toISOString().split('T')[0], true));
    //Add an optional tag field for grouping related items.
    modalFields.appendChild(createField('Tag', 'tag', 'text', '', false));
    //Add a sort order number field defaulting to 0.
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', 0, false));
    //Add a Visible checkbox so the curator can choose whether the item shows on the public site.
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', true, false));

    //Pop the modal open with a title that makes it clear this is the add flow.
    openModal("Add What's New Item");
});

//Open the Edit What's New Item modal with the item's current values pre-filled.
function editWhatsNew(item) {
    //Mark this as a What's New edit so the submit handler routes to the right endpoint.
    currentEditType = 'whats-new';
    //Capture the item ID so the submit handler knows which record to PUT against.
    currentEditId = item._id;

    //Convert the stored ISO date into the YYYY-MM-DD format that the date input expects.
    var dateStr = item.date ? new Date(item.date).toISOString().split('T')[0] : '';

    //Clear any leftover fields from a previous modal session before rebuilding the form.
    modalFields.innerHTML = '';
    //Pre-fill the title with the existing value, falling back to an empty string when missing.
    modalFields.appendChild(createField('Title', 'title', 'text', item.title || '', true));
    //Pre-fill the description textarea.
    modalFields.appendChild(createField('Description', 'description', 'textarea', item.description || '', true));
    //Pre-fill the date with the formatted dateStr from above.
    modalFields.appendChild(createField('Date', 'date', 'date', dateStr, true));
    //Pre-fill the optional tag field.
    modalFields.appendChild(createField('Tag', 'tag', 'text', item.tag || '', false));
    //Pre-fill the sort order, defaulting to 0 when not set.
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', item.sortOrder || 0, false));
    //Pre-fill the Visible checkbox with the item's current visibility setting.
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', item.display, false));

    //Pop the modal open with an Edit-flavored title.
    openModal("Edit What's New Item");
}

//Delete a What's New item after user confirmation. Shows both the title and _id in the confirmation dialog.
async function deleteWhatsNew(id, title) {
    //Prompt the user with the title and ID so they can confirm they're deleting the right record. Bail out if they cancel.
    if (!confirm('Are you sure you want to delete "' + (title || 'this item') + '"?\n\n_id: ' + id)) return;

    try {
        //Send the DELETE request to the API for this specific item.
        var response = await apiCall('/api/whats-new/' + id, { method: 'DELETE' });
        if (response.ok) {
            //On success, reload the grid so the deleted item disappears from the UI.
            loadWhatsNew();
        } else {
            //On a non-OK response, parse the body and surface whatever error the server reported.
            var data = await response.json();
            alert(data.error || 'Failed to delete item.');
        }
    } catch (error) {
        //Network error or similar exception, show a generic message to the user.
        alert('Error deleting item.');
    }
}

// Services & Licensing CRUD

//Fetch all Services & Licensing items from the API and render them as cards in the grid. Initializes drag-and-drop after rendering.
async function loadServices() {
    //Grab the services grid container where the rendered cards will be appended.
    var grid = document.getElementById('servicesGrid');
    try {
        //Hit the API to fetch the current list of services.
        var response = await apiCall('/api/services');
        //Parse the JSON response into a JavaScript array of service records.
        var items = await response.json();
        //Clear out the previous render so I can rebuild the grid from scratch.
        grid.innerHTML = '';

        //Show an empty state and stop if there are no services to render.
        if (items.length === 0) {
            grid.innerHTML = '<p class="loading-text">No services found. Click "+ Add New Service" to create one.</p>';
            return;
        }

        //Iterate over each service item and create a card element to display it in the grid. Each card includes a drag handle, move buttons, ID badges, service name, description, price, status indicators, and Edit/Delete action buttons.
        for (let index = 0; index < items.length; index++) {
            //Pull the current service record out of the array.
            let item = items[index];
            //Build the card div that will represent this service in the grid.
            let card = document.createElement('div');
            //Apply the standard item-card class so it picks up the shared card styling.
            card.className = 'item-card';
            //Stash the _id on the DOM node so reorder logic can read it back out later.
            card.setAttribute('data-id', item._id);

            //Build the entire service card markup via string concatenation. Same general layout as the What's New cards.
            card.innerHTML =
                //Top reorder bar holding the drag handle and move buttons.
                '<div class="card-reorder-bar">' +
                //Hamburger glyph used as the drag handle.
                '<span class="drag-handle" title="Drag to reorder">&#9776;</span>' +
                //Wrapper for the move buttons so they group together visually.
                '<div class="move-buttons">' +
                //Up arrow bumps the card one slot earlier.
                '<button class="move-btn move-up-btn" title="Move up">&#9650;</button>' +
                //Down arrow bumps the card one slot later.
                '<button class="move-btn move-down-btn" title="Move down">&#9660;</button>' +
                //Close the move-buttons wrapper.
                '</div>' +
                //Close the reorder bar.
                '</div>' +
                //ID badge row showing _id and the legacy product ID when present.
                '<div class="card-ids">' +
                //Mongo _id badge so curators can match cards to records.
                '<span class="id-badge"><strong>_id:</strong> ' + escapeHtml(item._id) + '</span>' +
                //Optional legacy Product ID badge.
                (item.legacyId !== undefined ? '<span class="id-badge"><strong>Product ID:</strong> ' + escapeHtml(String(item.legacyId)) + '</span>' : '') +
                //Close the ID badges row.
                '</div>' +
                //Service name heading, falling back to a placeholder when missing.
                '<h3>' + escapeHtml(item.serviceName || 'Untitled') + '</h3>' +
                //Service description paragraph.
                '<p class="card-description">' + escapeHtml(item.serviceDescription || '') + '</p>' +
                //Meta strip with price, active toggle, visibility toggle, and sort badge.
                '<div class="card-meta">' +
                //Localized price badge.
                '<span class="meta-price">$' + (item.price || 0).toLocaleString() + '</span>' +
                //Active badge whose CSS class swaps on the active flag.
                '<span class="meta-status ' + (item.active ? 'active' : 'inactive') + '">' +
                //Active badge text.
                (item.active ? 'Active' : 'Inactive') + '</span>' +
                //Visibility badge whose CSS class swaps on the display flag.
                '<span class="meta-status ' + (item.display ? 'active' : 'inactive') + '">' +
                //Visibility badge text.
                (item.display ? 'Visible' : 'Hidden') + '</span>' +
                //Sort order badge showing the 1-based DOM position.
                '<span class="meta-sort">Sort: ' + (index + 1) + '</span>' +
                //Close the meta strip.
                '</div>' +
                //Action row at the bottom of the card.
                '<div class="card-actions">' +
                //Edit button opens the modal with this service pre-filled.
                '<button class="edit-btn">Edit</button>' +
                //Delete button starts the delete-with-confirm flow.
                '<button class="delete-btn">Delete</button>' +
                //Close the action row.
                '</div>';

            //Wire the move buttons to the shared moveCard helper for the services grid.
            card.querySelector('.move-up-btn').addEventListener('click', function () {
                //Move this service card one slot earlier.
                moveCard(card, 'up', 'servicesGrid', 'services');
            });
            card.querySelector('.move-down-btn').addEventListener('click', function () {
                //Move this service card one slot later.
                moveCard(card, 'down', 'servicesGrid', 'services');
            });
            //Edit click hands off to editService which pre-fills the modal.
            card.querySelector('.edit-btn').addEventListener('click', function () {
                //Open the modal in edit mode for this service record.
                editService(item);
            });
            //Delete click hands off to deleteService which prompts and DELETEs.
            card.querySelector('.delete-btn').addEventListener('click', function () {
                //Pass both ID and serviceName so the confirm prompt can show the name.
                deleteService(item._id, item.serviceName);
            });

            grid.appendChild(card);
        }

        //Initialize drag-and-drop on the grid.
        initSortable('servicesGrid', 'services');
    } catch (error) {
        grid.innerHTML = '<p class="loading-text">Failed to load services.</p>';
    }
}

//Open the Add Service modal with empty fields.
document.getElementById('addServiceBtn').addEventListener('click', function () {
    //Mark this as a services flow so the submit handler routes to the services endpoint.
    currentEditType = 'services';
    //Null the edit ID so the submit handler treats this as a create rather than an update.
    currentEditId = null;

    //Clear out any leftover form fields from a previous modal session.
    modalFields.innerHTML = '';
    //Required service name input.
    modalFields.appendChild(createField('Service Name', 'serviceName', 'text', '', true));
    //Required multi-line description.
    modalFields.appendChild(createField('Description', 'serviceDescription', 'textarea', '', true));
    //Required price field defaulting to 0.
    modalFields.appendChild(createField('Price ($)', 'price', 'number', 0, true));
    //Optional sort order to control where this service appears in the list.
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', 0, false));
    //Visible toggle controlling whether the service shows on the public site.
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', true, false));
    //Active toggle controlling whether the service is currently being offered.
    modalFields.appendChild(createField('Active', 'active', 'checkbox', true, false));

    //Pop the modal open with the Add Service title.
    openModal('Add Service');
});

//Open the Edit Service modal with the service's current values pre-filled.
function editService(item) {
    //Tag this as a services edit so the submit handler picks the right API path.
    currentEditType = 'services';
    //Capture the service ID so the submit handler knows which record to update.
    currentEditId = item._id;

    //Clear out any leftover fields before rebuilding the form.
    modalFields.innerHTML = '';
    //Pre-fill the service name with the existing value.
    modalFields.appendChild(createField('Service Name', 'serviceName', 'text', item.serviceName || '', true));
    //Pre-fill the description textarea.
    modalFields.appendChild(createField('Description', 'serviceDescription', 'textarea', item.serviceDescription || '', true));
    //Pre-fill the price input.
    modalFields.appendChild(createField('Price ($)', 'price', 'number', item.price || 0, true));
    //Pre-fill the sort order.
    modalFields.appendChild(createField('Sort Order', 'sortOrder', 'number', item.sortOrder || 0, false));
    //Pre-fill the Visible checkbox.
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', item.display, false));
    //Pre-fill the Active checkbox.
    modalFields.appendChild(createField('Active', 'active', 'checkbox', item.active, false));

    //Pop the modal open with the Edit Service title.
    openModal('Edit Service');
}

//Delete a Service item after user confirmation. Shows both the name and _id in the confirmation dialog.
async function deleteService(id, name) {
    //Confirm the destructive action with the user, showing both name and ID so they're sure. Bail if they cancel.
    if (!confirm('Are you sure you want to delete "' + (name || 'this service') + '"?\n\n_id: ' + id)) return;

    try {
        //Send the DELETE request to the services endpoint for this ID.
        var response = await apiCall('/api/services/' + id, { method: 'DELETE' });
        if (response.ok) {
            //On success, reload the grid so the deleted card goes away.
            loadServices();
        } else {
            //On a non-OK response, parse the body and surface whatever error the server returned.
            var data = await response.json();
            alert(data.error || 'Failed to delete service.');
        }
    } catch (error) {
        //Network error or similar exception, show a generic message.
        alert('Error deleting service.');
    }
}

//Form submission handler shared by every modal. Reads the form data, picks POST or PUT based on whether I have an edit ID, and reloads the affected grid on success.
modalForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    //If the batch entry flow has its own handleSave listener attached, defer to it.
    //Both handlers would otherwise fire on the same submit, sending two PUTs to the same
    //record and racing — the second PUT reads a stale `existing` doc and tries to rename
    //source files that the first PUT already moved.
    if (batchEntryActive) return;

    //Capture the edit type and ID before closing the modal (closeModal resets these values).
    var editType = currentEditType;
    var editId = currentEditId;

    //Collect form field values. Checkboxes need special handling since they're excluded from FormData when unchecked.
    var formData = new FormData(modalForm);
    var body = {};

    //Iterate over each form field entry and populate the body object. Numeric fields like price and sortOrder are converted to Number type.
    for (const [key, value] of formData.entries()) {
        if (key === 'price' || key === 'sortOrder') {
            //Cast numeric inputs to Number so the server stores them as numbers rather than strings.
            body[key] = Number(value);
        } else {
            //All other fields are passed through as-is.
            body[key] = value;
        }
    }

    //Handle checkbox fields — FormData only includes checked checkboxes, so I need to explicitly check all checkbox inputs.
    var checkboxes = modalFields.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
        //Set the boolean value directly from the checkbox state so unchecked boxes also get persisted as false.
        body[checkbox.name] = checkbox.checked;
    }

    //For media edits, collect tags from the tag picker and galleries/location from special inputs.
    if (editType === 'media') {
        //Handle capturedAt — convert the datetime-local value to an ISO string for the server.
        //Append 'Z' so the value is parsed as UTC (matching how it was rendered into
        //the input from UTC components). Without 'Z', new Date() parses as local
        //time and the timestamp drifts by the user's TZ offset on every save.
        var capturedInput = document.getElementById('field-capturedAt');
        if (capturedInput) {
            body.capturedAt = capturedInput.value
                ? new Date(capturedInput.value + 'Z').toISOString()
                : null;
        }

        //Collect tags from the tag picker pills.
        var tagPills = modalFields.querySelectorAll('.tag-pill');
        //Build the outgoing tags array from the rendered pills.
        var tags = [];
        for (const pill of tagPills) {
            //Pull the tag name out of the pill's data attribute and add it to the array.
            tags.push(pill.getAttribute('data-tag'));
        }
        //Attach the collected tag list to the request body.
        body.tags = tags;

        //Collect galleries from the gallery inputs.
        var galleryInputs = modalFields.querySelectorAll('.gallery-entry');
        //Build the outgoing galleries array from each gallery row.
        var galleries = [];
        for (const entry of galleryInputs) {
            //Read the trimmed gallery name from each entry's input field.
            var gName = entry.querySelector('.gallery-name-input').value.trim();
            if (gName) {
                //Build a gallery object with a URL-safe slug, the display name, and a default position.
                galleries.push({
                    //Slug strips non-alphanumerics and trims dashes for a clean URL fragment.
                    gallerySlug: gName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                    //Display name preserves the user's original casing and spacing.
                    galleryName: gName,
                    //Default position; the server may reorder later via drag-and-drop.
                    galleryPosition: 1
                });
            }
        }
        //Attach the collected galleries to the request body.
        body.galleries = galleries;

        //Collect location from the three location inputs into a nested object.
        body.location = {
            //City field, defaulting to empty string when the input is missing.
            city: (document.getElementById('field-location-city') || {}).value || '',
            //State field, defaulting to empty string when the input is missing.
            state: (document.getElementById('field-location-state') || {}).value || '',
            //Country field, defaulting to empty string when the input is missing.
            country: (document.getElementById('field-location-country') || {}).value || ''
        };

        //Remove flat location/gallery fields that shouldn't be sent.
        delete body['location-city'];
        //Drop the flat state field.
        delete body['location-state'];
        //Drop the flat country field.
        delete body['location-country'];
        //Drop the flat gallery name field.
        delete body['gallery-name'];
    }

    //Determine the API endpoint and HTTP method based on whether this is a create (POST) or update (PUT) operation.
    var url, method;
    if (editType === 'whats-new') {
        //Existing What's New items use PUT against the item ID, new ones POST to the collection root.
        url = editId ? '/api/whats-new/' + editId : '/api/whats-new';
        //PUT for updates, POST for creates.
        method = editId ? 'PUT' : 'POST';
    } else if (editType === 'media') {
        //Media records can only be edited (uploads are handled separately) so always PUT against the ID.
        url = '/api/media/' + editId;
        method = 'PUT';
    } else {
        //Services follow the same create-vs-update pattern as What's New.
        url = editId ? '/api/services/' + editId : '/api/services';
        //PUT for updates, POST for creates.
        method = editId ? 'PUT' : 'POST';
    }

    try {
        //Fire off the save request with the JSON body I built above.
        var response = await apiCall(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            //Close the modal so the user sees the updated grid behind it.
            closeModal();
            //Reload the appropriate data grid after a successful save.
            if (editType === 'whats-new') {
                //Refresh the What's New grid.
                loadWhatsNew();
            } else if (editType === 'media') {
                //Refresh the Media grid.
                loadMedia();
            } else {
                //Refresh the Services grid.
                loadServices();
            }
        } else {
            //On a non-OK response, parse the body and surface whatever validation error the server returned.
            var data = await response.json();
            alert(data.error || 'Failed to save.');
        }
    } catch (error) {
        //Network error or similar exception, show a generic message.
        alert('Error saving item.');
    }
});

//Media CRUD plus upload helpers. Tag autocomplete data is fetched once per session and refreshed after each upload so the picker stays current.
var allExistingTags = [];

//Fetch all distinct tags from the server.
async function fetchAllTags() {
    try {
        //Hit the dedicated tags endpoint that returns an array of every distinct tag string.
        var response = await apiCall('/api/media/tags');
        //Parse and cache the result so the tag picker can use it without refetching every time it opens.
        allExistingTags = await response.json();
    } catch (error) {
        //If the fetch fails for any reason, fall back to an empty list so the picker still works.
        allExistingTags = [];
    }
}

//Create a tag picker widget. Returns a container div with pill display, typeahead input, and dropdown.
//initialTags is an array of strings for pre-filled tags.
function createTagPicker(initialTags) {
    //Outer wrapper so the tag picker matches the styling of other form fields.
    var container = document.createElement('div');
    container.className = 'form-group';

    //Build the label that sits above the picker.
    var label = document.createElement('label');
    label.textContent = 'Tags';
    container.appendChild(label);

    //Inner picker element that holds the pills and the input together.
    var picker = document.createElement('div');
    picker.className = 'tag-picker';

    //Area where the selected tag pills are rendered.
    var pillsArea = document.createElement('div');
    pillsArea.className = 'tag-pills-area';
    picker.appendChild(pillsArea);

    //Wrapper around the text input and dropdown so they can be positioned together.
    var inputWrap = document.createElement('div');
    inputWrap.className = 'tag-input-wrap';

    //Text input the user types into to filter or create tags.
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-input';
    input.placeholder = 'Type to add tags...';
    inputWrap.appendChild(input);

    //Dropdown that shows matching existing tags or a Create option.
    var dropdown = document.createElement('div');
    dropdown.className = 'tag-dropdown';
    //Hide the dropdown by default; it only appears when the input is focused.
    dropdown.style.display = 'none';
    inputWrap.appendChild(dropdown);

    //Stitch the input wrapper into the picker, then put the picker inside the outer container.
    picker.appendChild(inputWrap);
    container.appendChild(picker);

    //Get current tags as an array of strings from the pills.
    function getCurrentTags() {
        //Collect all the rendered pills and pull their data-tag attribute into a plain array.
        var tags = [];
        var pills = pillsArea.querySelectorAll('.tag-pill');
        for (const pill of pills) {
            tags.push(pill.getAttribute('data-tag'));
        }
        return tags;
    }

    //Add a tag pill.
    function addTagPill(tag) {
        //Normalize the tag to lowercase, strip non-alphanumerics, and trim leading/trailing dashes so all tags follow the same format.
        tag = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '');
        //Bail if the tag is empty after normalization.
        if (!tag) return;
        //Prevent duplicates.
        if (getCurrentTags().indexOf(tag) !== -1) return;

        //Build the pill DOM with the tag text and a small remove button.
        var pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.setAttribute('data-tag', tag);
        pill.innerHTML = escapeHtml(tag) + ' <button type="button" class="tag-pill-remove">&times;</button>';
        //Wire the remove button to drop this pill from the DOM when clicked.
        pill.querySelector('.tag-pill-remove').addEventListener('click', function () {
            pill.remove();
        });
        //Append the finished pill to the pills area.
        pillsArea.appendChild(pill);
    }

    //Populate initial tags.
    if (initialTags && initialTags.length) {
        //Walk the incoming tag array and add a pill for each one.
        for (const t of initialTags) {
            addTagPill(t);
        }
    }

    //Show dropdown filtered by input value.
    function showDropdown() {
        //Read the current query and the already-selected tags so I can filter the dropdown.
        var query = input.value.trim().toLowerCase();
        var current = getCurrentTags();
        //Filter existing tags: match query and not already added.
        var filtered = allExistingTags.filter(function (t) {
            return t.toLowerCase().indexOf(query) !== -1 && current.indexOf(t) === -1;
        });

        //Hide the dropdown when there's nothing to show and the user hasn't typed anything yet.
        if (filtered.length === 0 && !query) {
            dropdown.style.display = 'none';
            return;
        }

        //Reset the dropdown contents before re-rendering.
        dropdown.innerHTML = '';
        //If the user typed something that doesn't exist, show a "Create" option.
        if (query && allExistingTags.indexOf(query) === -1 && current.indexOf(query) === -1) {
            //Build a special create-flavored dropdown row.
            var createItem = document.createElement('div');
            //Apply both the standard item class and the create-flavored modifier.
            createItem.className = 'tag-dropdown-item tag-dropdown-create';
            //Show the user what tag they're about to create.
            createItem.textContent = 'Create "' + query + '"';
            //Use mousedown rather than click so the action fires before the input's blur handler hides the dropdown.
            createItem.addEventListener('mousedown', function (e) {
                //Prevent the input from losing focus before I add the pill.
                e.preventDefault();
                //Add the new tag as a pill in the picker.
                addTagPill(query);
                //Clear the search input so the user can type the next tag.
                input.value = '';
                //Hide the dropdown now that the selection is made.
                dropdown.style.display = 'none';
            });
            //Drop the create row into the dropdown.
            dropdown.appendChild(createItem);
        }

        //Render up to 15 matching existing tags as dropdown rows.
        for (const tag of filtered.slice(0, 15)) {
            //Build a dropdown row for this matching tag.
            var item = document.createElement('div');
            //Standard dropdown item class.
            item.className = 'tag-dropdown-item';
            //Show the tag name as the row label.
            item.textContent = tag;
            //Mousedown so it fires before the input's blur hides the dropdown.
            item.addEventListener('mousedown', function (e) {
                //Prevent input blur from hiding the dropdown before the pill is added.
                e.preventDefault();
                //Add the selected tag as a pill in the picker.
                addTagPill(tag);
                //Clear the search input so the user can type the next tag.
                input.value = '';
                //Hide the dropdown now that the selection is made.
                dropdown.style.display = 'none';
            });
            //Drop the row into the dropdown.
            dropdown.appendChild(item);
        }

        //Show the dropdown only if it actually has rows in it.
        if (dropdown.children.length > 0) {
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    }

    //Re-run the dropdown filter whenever the user types or focuses the input.
    input.addEventListener('input', showDropdown);
    input.addEventListener('focus', showDropdown);
    input.addEventListener('blur', function () {
        //Delay hiding so mousedown on dropdown items registers first.
        setTimeout(function () { dropdown.style.display = 'none'; }, 200);
    });

    //Allow pressing Enter to create a tag from the typed value.
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            //Block form submission since Enter inside a tag input shouldn't submit the surrounding modal.
            e.preventDefault();
            //Read the trimmed input value and add it as a pill if it isn't empty.
            var val = input.value.trim();
            if (val) {
                addTagPill(val);
                input.value = '';
                dropdown.style.display = 'none';
            }
        }
    });

    //Hand the finished picker container back to the caller.
    return container;
}

//Create a gallery input section. Returns a container div with an "Add Gallery" button and dynamic gallery name inputs.
function createGalleryInput(initialGalleries) {
    //Outer wrapper styled like the rest of the form fields.
    var container = document.createElement('div');
    container.className = 'form-group';

    //Section label so the user knows what these inputs are for.
    var label = document.createElement('label');
    label.textContent = 'Galleries *';
    container.appendChild(label);

    //Inner wrapper that holds the per-gallery rows (so the Add button stays anchored below them).
    var entriesWrap = document.createElement('div');
    entriesWrap.className = 'gallery-entries';
    container.appendChild(entriesWrap);

    //Helper for building a single gallery entry row with a name input and a remove button.
    function addEntry(name) {
        //Wrapper for one gallery row.
        var entry = document.createElement('div');
        entry.className = 'gallery-entry';
        //The text input the user types the gallery name into.
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'gallery-name-input';
        nameInput.placeholder = 'Gallery name (e.g. Wildlife)';
        nameInput.value = name || '';
        entry.appendChild(nameInput);

        //Remove button so the user can drop a gallery they added by mistake.
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'gallery-remove-btn';
        //Multiplication sign as a close-style icon.
        removeBtn.textContent = '\u00D7';
        removeBtn.addEventListener('click', function () {
            //Pop this whole entry out of the DOM when the user clicks the remove button.
            entry.remove();
        });
        entry.appendChild(removeBtn);
        //Append the completed entry into the entries wrapper.
        entriesWrap.appendChild(entry);
    }

    //Populate initial galleries.
    if (initialGalleries && initialGalleries.length) {
        //Build a row for each pre-existing gallery on the item.
        for (const g of initialGalleries) {
            addEntry(g.galleryName || '');
        }
    }

    //Add Gallery button that appends a fresh empty row when clicked.
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'gallery-add-btn';
    addBtn.textContent = '+ Add Gallery';
    addBtn.addEventListener('click', function () { addEntry(''); });
    container.appendChild(addBtn);

    //Hand the finished gallery input back to the caller.
    return container;
}

//Fetch all media items from the API and render them as cards in the media grid.
async function loadMedia() {
    //Grab the media grid container that the rendered cards will be inserted into.
    var grid = document.getElementById('mediaGrid');
    try {
        //Hit the media endpoint to fetch the current set of media records.
        var response = await apiCall('/api/media');
        //Parse the JSON body into an array of media documents.
        var items = await response.json();
        //Wipe the grid before re-rendering so I don't double up cards.
        grid.innerHTML = '';

        //Show an empty state and stop if there's nothing to render.
        if (items.length === 0) {
            grid.innerHTML = '<p class="loading-text">No media found. Click "+ Upload Media" to add some.</p>';
            return;
        }

        //Walk through every media item and build a card for it.
        for (let index = 0; index < items.length; index++) {
            //Pull the current item out of the array.
            let item = items[index];
            //Create the card element and apply the shared media-card styling.
            let card = document.createElement('div');
            card.className = 'item-card media-card';
            //Stash the _id on the DOM so reorder logic can read it back out.
            card.setAttribute('data-id', item._id);

            //Determine thumbnail file name for the card. Prefer thumbnailPath, fall back to displayResolutionPath.
            var thumbFile = item.thumbnailPath ? item.thumbnailPath.split('/').pop() : '';
            var thumbRoute = '/thumbnails/';
            if (!thumbFile) {
                //No thumbnail on disk, so I'll fall back to the display-resolution version served from /media/.
                thumbFile = item.displayResolutionPath ? item.displayResolutionPath.split('/').pop() : '';
                thumbRoute = '/media/';
            }
            //Track whether this is a video so I can pick the right badge styling later.
            var isVideo = item.mediaType === 'video';

            //Build the thumbnail HTML if I have a file to render. URL-encode the filename to handle spaces and special characters.
            var thumbnailHtml = '';
            if (thumbFile) {
                thumbnailHtml = '<img class="media-card-thumb" src="' + thumbRoute + encodeURIComponent(thumbFile) + '" alt="' + escapeHtml(item.alt || item.title) + '">';
            }

            //Build gallery badges.
            var galleryBadges = '';
            if (item.galleries && item.galleries.length) {
                //One badge per gallery the item belongs to.
                for (const g of item.galleries) {
                    galleryBadges += '<span class="gallery-badge">' + escapeHtml(g.galleryName) + '</span>';
                }
            }

            //Build tag badges.
            var tagBadges = '';
            if (item.tags && item.tags.length) {
                //One badge per tag on the item.
                for (const t of item.tags) {
                    tagBadges += '<span class="tag-badge">' + escapeHtml(t) + '</span>';
                }
            }

            //Check for missing required fields.
            var warnings = [];
            //Track which required fields are missing so the curator knows what still needs filling in.
            if (!item.description) warnings.push('description');
            if (!item.alt) warnings.push('alt');
            if (!item.galleries || item.galleries.length === 0) warnings.push('galleries');
            var warningHtml = '';
            if (warnings.length > 0) {
                //Render a single warning banner listing all the missing fields.
                warningHtml = '<div class="media-card-warning">Missing: ' + escapeHtml(warnings.join(', ')) + '</div>';
            }

            //Build the entire media card markup via string concatenation. Includes thumbnail, IDs, warnings, meta, gallery/tag badges, and actions.
            card.innerHTML =
                //Top reorder bar holding the drag handle and move buttons.
                '<div class="card-reorder-bar">' +
                //Hamburger glyph used as the drag handle.
                '<span class="drag-handle" title="Drag to reorder">&#9776;</span>' +
                //Wrapper for the move buttons.
                '<div class="move-buttons">' +
                //Up arrow bumps the card one slot earlier.
                '<button class="move-btn move-up-btn" title="Move up">&#9650;</button>' +
                //Down arrow bumps the card one slot later.
                '<button class="move-btn move-down-btn" title="Move down">&#9660;</button>' +
                //Close the move-buttons wrapper.
                '</div>' +
                //Close the reorder bar.
                '</div>' +
                //Optional thumbnail wrapper, only rendered when thumbnailHtml exists.
                (thumbnailHtml ? '<div class="media-card-thumb-wrap">' + thumbnailHtml + '</div>' : '') +
                //ID badges row.
                '<div class="card-ids">' +
                //Mongo _id badge so curators can match cards to records.
                '<span class="id-badge"><strong>_id:</strong> ' + escapeHtml(item._id) + '</span>' +
                //Media type badge (photo or video) with a CSS class that swaps on the type.
                '<span class="id-badge media-type-badge ' + (isVideo ? 'video-badge' : 'photo-badge') + '">' + escapeHtml(item.mediaType || 'photo') + '</span>' +
                //Close the ID badges row.
                '</div>' +
                //Warning banner listing missing required fields, only rendered when something's missing.
                warningHtml +
                //Item title heading, falling back to a placeholder when missing.
                '<h3>' + escapeHtml(item.title || 'Untitled') + '</h3>' +
                //Item description paragraph.
                '<p class="card-description">' + escapeHtml(item.description || '') + '</p>' +
                //Meta strip with the various display flags and sort badge.
                '<div class="card-meta">' +
                //Visibility badge whose class swaps on the display flag.
                '<span class="meta-status ' + (item.display ? 'active' : 'inactive') + '">' +
                //Visibility badge text.
                (item.display ? 'Visible' : 'Hidden') + '</span>' +
                //Homepage badge whose class swaps on the showOnHomepage flag.
                '<span class="meta-status ' + (item.showOnHomepage ? 'active' : 'inactive') + '">' +
                //Homepage badge text.
                (item.showOnHomepage ? 'Homepage' : 'Not on homepage') + '</span>' +
                //Optional Recent badge, only when the item is in the recent slot.
                (item.showInRecent ? '<span class="meta-status active">Recent</span>' : '') +
                //Optional Featured badge, only when the item is featured.
                (item.featured ? '<span class="meta-status active">Featured</span>' : '') +
                //Sort order badge showing the 1-based DOM position.
                '<span class="meta-sort">Sort: ' + (index + 1) + '</span>' +
                //Close the meta strip.
                '</div>' +
                //Optional gallery badges row, only when the item belongs to one or more galleries.
                (galleryBadges ? '<div class="media-card-galleries">' + galleryBadges + '</div>' : '') +
                //Optional tag badges row, only when the item carries one or more tags.
                (tagBadges ? '<div class="media-card-tags">' + tagBadges + '</div>' : '') +
                //Action row at the bottom of the card.
                '<div class="card-actions">' +
                //Edit button opens the modal with this media pre-filled.
                '<button class="edit-btn">Edit</button>' +
                //Delete button starts the delete-with-confirm flow that also removes files from disk.
                '<button class="delete-btn">Delete</button>' +
                //Close the action row.
                '</div>';

            //Wire the move buttons to the shared moveCard helper for the media grid.
            card.querySelector('.move-up-btn').addEventListener('click', function () {
                //Move this media card one slot earlier.
                moveCard(card, 'up', 'mediaGrid', 'media');
            });
            card.querySelector('.move-down-btn').addEventListener('click', function () {
                //Move this media card one slot later.
                moveCard(card, 'down', 'mediaGrid', 'media');
            });
            //Edit click hands off to editMedia which fetches tags and pre-fills the modal.
            card.querySelector('.edit-btn').addEventListener('click', function () {
                //Open the modal in edit mode for this media record.
                editMedia(item);
            });
            //Delete click hands off to deleteMedia which prompts then DELETEs both the record and the files on disk.
            card.querySelector('.delete-btn').addEventListener('click', function () {
                //Pass both ID and title so the confirm prompt can show a friendly name.
                deleteMedia(item._id, item.title);
            });

            grid.appendChild(card);
        }

        //Initialize drag-and-drop on the media grid.
        initSortable('mediaGrid', 'media');
    } catch (error) {
        grid.innerHTML = '<p class="loading-text">Failed to load media.</p>';
    }
}

//Open the Edit Media modal with the item's current values pre-filled.
async function editMedia(item) {
    //Tag this as a media edit so the submit handler routes to the media endpoint.
    currentEditType = 'media';
    //Capture the media ID so the submit handler knows which record to update.
    currentEditId = item._id;

    //Refresh the tag cache before building the picker so the autocomplete shows the latest set.
    await fetchAllTags();

    //Wipe any leftover fields from a previous modal session before rebuilding the form.
    modalFields.innerHTML = '';
    //Build the title field, capturing the group so I can wire up auto-fill below.
    var editTitleGroup = createField('Title', 'title', 'text', item.title || '', true);
    //Add the title field to the modal.
    modalFields.appendChild(editTitleGroup);
    //Add the description textarea.
    modalFields.appendChild(createField('Description', 'description', 'textarea', item.description || '', true));
    //Build the alt-text field, capturing the group so I can wire up auto-fill below.
    var editAltGroup = createField('Alt Text', 'alt', 'text', item.alt || '', true);
    //Add the alt field to the modal.
    modalFields.appendChild(editAltGroup);

    //Wire up title to alt auto-fill so editing the title also fills alt unless the user has touched alt manually.
    var editTitleInput = editTitleGroup.querySelector('input');
    //Reach into the alt group to grab the actual input element.
    var editAltInput = editAltGroup.querySelector('input');
    //If the existing record already has alt text, treat alt as already manually edited so we don't clobber it.
    var editAltManual = Boolean(item.alt);
    //As soon as the user types in the alt field, mark it as manually edited so the auto-fill stops.
    editAltInput.addEventListener('input', function () {
        //Flip the manual flag so further title edits don't overwrite this value.
        editAltManual = true;
    });
    //Mirror title changes into alt only while alt hasn't been manually touched.
    editTitleInput.addEventListener('input', function () {
        //Only sync when the user hasn't taken control of alt.
        if (!editAltManual) {
            //Copy the title value into the alt field.
            editAltInput.value = editTitleInput.value;
        }
    });

    //Add the Creator field defaulting to Scott Short when the record doesn't carry one.
    modalFields.appendChild(createField('Creator', 'creator', 'text', item.creator || 'Scott Short', false));

    //Build the captured-at value as a string the datetime-local input understands. Editable so curators can correct missing metadata.
    var capturedVal = '';
    //Only format a value if the record actually has a captured timestamp.
    if (item.capturedAt) {
        //Parse the stored ISO string into a Date.
        var cd = new Date(item.capturedAt);
        //Format as YYYY-MM-DDTHH:MM:SS in UTC since the input expects that exact shape.
        capturedVal = cd.getUTCFullYear() + '-' +
            String(cd.getUTCMonth() + 1).padStart(2, '0') + '-' +
            String(cd.getUTCDate()).padStart(2, '0') + 'T' +
            String(cd.getUTCHours()).padStart(2, '0') + ':' +
            String(cd.getUTCMinutes()).padStart(2, '0') + ':' +
            String(cd.getUTCSeconds()).padStart(2, '0');
    }
    //Add the Captured Date/Time field with the formatted value.
    modalFields.appendChild(createField('Captured Date/Time', 'capturedAt', 'datetime-local', capturedVal, false));

    //Add the tag picker with the item's existing tags pre-selected.
    modalFields.appendChild(createTagPicker(item.tags || []));

    //Add the gallery input with the item's existing galleries pre-populated.
    modalFields.appendChild(createGalleryInput(item.galleries || []));

    //Build a section label for the Location group so the three location fields read as a unit.
    var locLabel = document.createElement('label');
    //Set the section label text.
    locLabel.textContent = 'Location';
    //Use the section-label class so it stands apart from the regular field labels.
    locLabel.className = 'section-label';
    //Drop the section label into the modal.
    modalFields.appendChild(locLabel);
    //City field, pre-filled from the location subdocument when present.
    modalFields.appendChild(createField('City', 'location-city', 'text', item.location ? item.location.city : '', false));
    //State field, pre-filled from the location subdocument when present.
    modalFields.appendChild(createField('State', 'location-state', 'text', item.location ? item.location.state : '', false));
    //Country field, pre-filled from the location subdocument when present.
    modalFields.appendChild(createField('Country', 'location-country', 'text', item.location ? item.location.country : '', false));

    //Display flag controlling whether the item shows on the public site at all.
    modalFields.appendChild(createField('Visible', 'display', 'checkbox', item.display, false));
    //Homepage flag controlling whether the item appears in the homepage rotation.
    modalFields.appendChild(createField('Show on Homepage', 'showOnHomepage', 'checkbox', item.showOnHomepage, false));
    //Recent flag controlling whether the item appears in the recent slot.
    modalFields.appendChild(createField('Show in Recent', 'showInRecent', 'checkbox', item.showInRecent, false));
    //Featured flag controlling whether the item gets featured highlighting.
    modalFields.appendChild(createField('Featured', 'featured', 'checkbox', item.featured, false));

    //Pop the modal open with a title that includes the item title for context.
    openModal('Edit Media — ' + escapeHtml(item.title || 'Untitled'));
}

//Delete a media item after user confirmation.
async function deleteMedia(id, title) {
    //Confirm the destructive action with the user. Bail out if they cancel since this also removes files from disk.
    if (!confirm('Are you sure you want to delete "' + (title || 'this item') + '"?\n\nThis will also delete the files from disk.\n\n_id: ' + id)) return;

    try {
        //Send the DELETE request for this media ID.
        var response = await apiCall('/api/media/' + id, { method: 'DELETE' });
        if (response.ok) {
            //Reload the grid so the deleted card vanishes.
            loadMedia();
        } else {
            //On a non-OK response, surface the server's error message.
            var data = await response.json();
            alert(data.error || 'Failed to delete media.');
        }
    } catch (error) {
        //Network error or similar exception, show a generic message.
        alert('Error deleting media.');
    }
}

//Media upload workflow: triggers the hidden file picker, then routes each file through the direct or chunked upload path depending on size.
document.getElementById('uploadMediaBtn').addEventListener('click', function () {
    //Forward the click to the hidden file input so the picker opens.
    document.getElementById('mediaFileInput').click();
});

//Handle file selection for media upload.
document.getElementById('mediaFileInput').addEventListener('change', async function () {
    //Read the FileList off the input. Bail if the user cancelled the picker.
    var files = this.files;
    if (!files || files.length === 0) return;

    //Reveal the upload progress UI and seed it with a fresh progress bar and status row.
    var progressArea = document.getElementById('uploadProgressArea');
    //Make the progress area visible.
    progressArea.style.display = 'block';
    //Render an empty progress bar and a starting status line.
    progressArea.innerHTML =
        '<div class="upload-progress-entry">' +
        '<div class="upload-progress-bar-wrap"><div class="upload-progress-bar"></div></div>' +
        '<div class="upload-status">Uploading... 0/' + files.length + '</div>' +
        '</div>';

    //Grab handles to the bar and status text so I can update them as uploads progress.
    var bar = progressArea.querySelector('.upload-progress-bar');
    //Status line element.
    var statusEl = progressArea.querySelector('.upload-status');
    //Track totals and any errors so I can show an accurate final summary.
    var totalFiles = files.length;
    //Running count of files that finished (success or failure).
    var completedFiles = 0;
    //Sticky flag set to true on any per-file failure.
    var hasError = false;

    //Fetch latest tags before starting the upload workflow.
    await fetchAllTags();

    //Upload results to process for missing fields.
    var uploadResults = [];
    //Per-file error messages collected for the final summary.
    var errorDetails = [];

    //Upload each selected file in sequence so I don't hammer the server with parallel uploads.
    for (let i = 0; i < files.length; i++) {
        //Pull the current file out of the FileList.
        var file = files[i];

        try {
            //Upload using XMLHttpRequest for progress tracking.
            var result = await uploadFile(file, bar, statusEl, i, totalFiles);
            //Bump the completed counter regardless of per-document outcomes.
            completedFiles++;
            if (result && result.length > 0) {
                //The endpoint can return a mix of successful documents and per-file errors, so split them apart.
                for (const r of result) {
                    if (r.document) {
                        //Successful upload, queue the doc for the batch entry flow below.
                        uploadResults.push(r);
                    } else if (r.error) {
                        //Per-file error, record it for the summary message.
                        hasError = true;
                        //Capture the filename and the server-supplied error string.
                        errorDetails.push(file.name + ': ' + r.error);
                        //Log to the console for debugging.
                        console.error('Upload error for', file.name, ':', r.error);
                    }
                }
            }
        } catch (error) {
            //Network or HTTP-level failure, log it and keep going with the next file.
            completedFiles++;
            //Mark the batch as having errors.
            hasError = true;
            //Record the failure for the summary.
            errorDetails.push(file.name + ': ' + error.message);
            //Log to the console for debugging.
            console.error('Upload failed for', file.name, ':', error.message);
        }
    }

    //Update final status.
    bar.style.width = '100%';
    if (hasError) {
        //Build a summary that includes per-file error details when something went wrong.
        var errorMsg = 'Completed with errors (' + completedFiles + '/' + totalFiles + ')';
        if (errorDetails.length > 0) {
            errorMsg += ' — ' + errorDetails.join('; ');
        }
        statusEl.textContent = errorMsg;
        statusEl.classList.add('upload-error');
    } else {
        //All uploads succeeded, show a clean success summary.
        statusEl.textContent = 'All ' + totalFiles + ' file(s) uploaded';
        statusEl.classList.add('upload-success');
    }

    //Clear the file input so the same files can be re-selected if needed.
    this.value = '';

    //Process each uploaded item sequentially via batch entry flow.
    if (uploadResults.length > 0) {
        await runBatchEntry(uploadResults);
    }

    //Hide progress area and reload media grid.
    setTimeout(function () {
        //Tear down the progress UI a couple seconds after completion.
        progressArea.style.display = 'none';
        progressArea.innerHTML = '';
    }, 2000);
    loadMedia();
});

//Chunk size for large file uploads (50 MB). Files larger than this are uploaded in chunks.
var CHUNK_SIZE = 50 * 1024 * 1024;

//Upload a single file. Files over CHUNK_SIZE are uploaded in chunks to work within Cloudflare's 100 MB limit.
function uploadFile(file, progressBar, statusEl, fileIndex, totalFiles) {
    if (file.size > CHUNK_SIZE) {
        //Large files go through the chunked upload path so each request stays under the proxy limit.
        return uploadFileChunked(file, progressBar, statusEl, fileIndex, totalFiles);
    }
    //Small files go directly via a single multipart POST.
    return uploadFileDirect(file, progressBar, statusEl, fileIndex, totalFiles);
}

//Upload a small file directly via XHR with progress tracking.
function uploadFileDirect(file, progressBar, statusEl, fileIndex, totalFiles) {
    return new Promise(function (resolve, reject) {
        //Build a multipart form payload with the file under the 'media' field name.
        var formData = new FormData();
        formData.append('media', file);

        //Use XHR rather than fetch so I can hook into upload progress events.
        var xhr = new XMLHttpRequest();
        //Open a POST against the standard upload endpoint.
        xhr.open('POST', '/api/media/upload');

        //Wire upload-progress events to the shared progress UI.
        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                //Convert this file's progress into an overall percentage across all files in the batch.
                var fileProgress = e.loaded / e.total;
                //Compute the overall percentage by adding this file's fractional progress to the index.
                var overallPct = Math.round(((fileIndex + fileProgress) / totalFiles) * 100);
                //Snap the bar to the new percentage.
                progressBar.style.width = overallPct + '%';
                //Update the status text with the per-file count and percentage.
                statusEl.textContent = 'Uploading file ' + (fileIndex + 1) + '/' + totalFiles + ' (' + overallPct + '%)';
            }
        });

        //Handle the load event once the server response has fully arrived.
        xhr.addEventListener('load', function () {
            if (xhr.status === 201) {
                //Successful upload, snap the progress bar to this file's slice and update the status line.
                var overallPct = Math.round(((fileIndex + 1) / totalFiles) * 100);
                //Set the bar to the post-this-file overall percentage.
                progressBar.style.width = overallPct + '%';
                //Update the status to show this file is done.
                statusEl.textContent = 'Uploaded ' + (fileIndex + 1) + '/' + totalFiles;
                try {
                    //Parse the JSON response body and resolve with it.
                    resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                    //Server returned a non-JSON body; resolve with an empty array so the caller doesn't choke.
                    resolve([]);
                }
            } else if (xhr.status === 401) {
                //Session expired mid-upload, kick the user back to the login page.
                window.location.href = '/login';
                //Reject so the awaiting caller stops processing.
                reject(new Error('Session expired'));
            } else {
                //Build a useful error message from whatever the server returned.
                var errMsg = 'Upload failed (HTTP ' + xhr.status + ')';
                try {
                    //Try to parse the error body for a more specific message.
                    var errData = JSON.parse(xhr.responseText);
                    //Use the server-provided message when present.
                    if (errData.error) errMsg = errData.error;
                } catch (e) { /* ignore */ }
                //Reject with the assembled message.
                reject(new Error(errMsg));
            }
        });

        //Surface low-level network and timeout failures as rejections.
        xhr.addEventListener('error', function () { reject(new Error('Network error')); });
        //Timeout listener so a stalled request doesn't hang the batch forever.
        xhr.addEventListener('timeout', function () { reject(new Error('Upload timed out')); });
        //10-minute timeout to allow large-but-not-chunked files to finish.
        xhr.timeout = 600000;
        //Kick off the request.
        xhr.send(formData);
    });
}

//Upload a large file in chunks, then finalize to trigger processing.
async function uploadFileChunked(file, progressBar, statusEl, fileIndex, totalFiles) {
    //Generate a unique upload ID so the server can stitch the chunks back together.
    var uploadId = crypto.randomUUID();
    //Compute how many chunks I'll need for this file.
    var totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    //Track bytes uploaded so far so I can compute progress as chunks complete.
    var totalUploaded = 0;

    //Send each chunk sequentially.
    for (var c = 0; c < totalChunks; c++) {
        //Compute the byte range for this chunk and slice the blob accordingly.
        var start = c * CHUNK_SIZE;
        var end = Math.min(start + CHUNK_SIZE, file.size);
        var chunk = file.slice(start, end);

        //Wrap the per-chunk XHR in a Promise so I can await it inside the loop.
        await new Promise(function (resolve, reject) {
            //Build a fresh XHR for this chunk.
            var xhr = new XMLHttpRequest();
            //POST against the chunk endpoint that buffers the bytes server-side.
            xhr.open('POST', '/api/media/upload-chunk');
            //Pass the upload ID and chunk metadata via headers so the server knows how to reassemble the file.
            xhr.setRequestHeader('X-Upload-Id', uploadId);
            //Tell the server which chunk index this is.
            xhr.setRequestHeader('X-Chunk-Index', String(c));
            //Tell the server how many chunks total to expect.
            xhr.setRequestHeader('X-Total-Chunks', String(totalChunks));
            //Pass the original filename so the server can name the reassembled file.
            xhr.setRequestHeader('X-File-Name', file.name);
            //Pass the MIME type so the server can categorize the upload.
            xhr.setRequestHeader('X-Mime-Type', file.type);

            //Hook upload progress for this individual chunk.
            xhr.upload.addEventListener('progress', function (e) {
                if (e.lengthComputable) {
                    //Combine bytes already uploaded with progress on the current chunk to get an overall percentage.
                    var chunkUploaded = totalUploaded + e.loaded;
                    //Convert that into a per-file fraction.
                    var fileProgress = chunkUploaded / file.size;
                    //Then into an overall batch percentage.
                    var overallPct = Math.round(((fileIndex + fileProgress) / totalFiles) * 100);
                    //Snap the bar.
                    progressBar.style.width = overallPct + '%';
                    //Update the status with file, chunk, and percentage info.
                    statusEl.textContent = 'Uploading file ' + (fileIndex + 1) + '/' + totalFiles + ' \u2014 chunk ' + (c + 1) + '/' + totalChunks + ' (' + overallPct + '%)';
                }
            });

            //Handle the response when the chunk POST completes.
            xhr.addEventListener('load', function () {
                if (xhr.status === 200) {
                    //Chunk accepted, bump the running byte count and continue.
                    totalUploaded += (end - start);
                    //Resolve so the await advances to the next chunk.
                    resolve();
                } else if (xhr.status === 401) {
                    //Session expired mid-upload, kick back to login.
                    window.location.href = '/login';
                    //Reject so the awaiting loop stops.
                    reject(new Error('Session expired'));
                } else {
                    //Build a useful per-chunk error message from the server response.
                    var errMsg = 'Chunk upload failed (HTTP ' + xhr.status + ')';
                    try {
                        //Try to parse the error body for a server-provided message.
                        var errData = JSON.parse(xhr.responseText);
                        //Use the server message when present.
                        if (errData.error) errMsg = errData.error;
                    } catch (e) { /* ignore */ }
                    //Reject with the assembled message.
                    reject(new Error(errMsg));
                }
            });

            //Surface network and timeout failures as rejections.
            xhr.addEventListener('error', function () { reject(new Error('Network error during chunk upload')); });
            //Timeout handler so a hung chunk doesn't stall forever.
            xhr.addEventListener('timeout', function () { reject(new Error('Chunk upload timed out')); });
            //10-minute timeout to match the direct upload limit.
            xhr.timeout = 600000;
            //Send just this chunk's bytes.
            xhr.send(chunk);
        });
    }

    //All chunks uploaded — call finalize to reassemble and process.
    statusEl.textContent = 'Processing file ' + (fileIndex + 1) + '/' + totalFiles + '...';

    //Finalize call kicks off server-side reassembly, processing, and DB insertion. Wraps the result so callers can await it.
    return new Promise(function (resolve, reject) {
        //Build the finalize XHR.
        var xhr = new XMLHttpRequest();
        //POST against the finalize endpoint.
        xhr.open('POST', '/api/media/upload-finalize');
        //JSON body with the upload identifier and file metadata.
        xhr.setRequestHeader('Content-Type', 'application/json');

        //Handle the response when the finalize call returns.
        xhr.addEventListener('load', function () {
            if (xhr.status === 201) {
                //Finalize succeeded, snap the progress bar to this file's slice and parse the response.
                var overallPct = Math.round(((fileIndex + 1) / totalFiles) * 100);
                //Set the bar to the post-this-file overall percentage.
                progressBar.style.width = overallPct + '%';
                //Update the status to show this file is done.
                statusEl.textContent = 'Uploaded ' + (fileIndex + 1) + '/' + totalFiles;
                try {
                    //Parse the JSON response and resolve with it.
                    resolve(JSON.parse(xhr.responseText.trim()));
                } catch (e) {
                    //Server returned an unparseable body, resolve with an empty array so the caller doesn't choke.
                    resolve([]);
                }
            } else if (xhr.status === 401) {
                //Session expired during finalize, kick to login.
                window.location.href = '/login';
                //Reject so the awaiting caller stops processing.
                reject(new Error('Session expired'));
            } else {
                //Build a useful error message from whatever the server returned.
                var errMsg = 'Finalize failed (HTTP ' + xhr.status + ')';
                try {
                    //Try to parse the error body for a more specific message.
                    var errData = JSON.parse(xhr.responseText.trim());
                    //Use the server-provided message when present.
                    if (errData.error) errMsg = errData.error;
                } catch (e) { /* ignore */ }
                //Reject with the assembled message.
                reject(new Error(errMsg));
            }
        });

        //Surface network and timeout failures as rejections.
        xhr.addEventListener('error', function () { reject(new Error('Network error during finalize')); });
        //Timeout handler so a hung finalize doesn't stall forever.
        xhr.addEventListener('timeout', function () { reject(new Error('Finalize timed out')); });
        //10-minute timeout to match the chunk and direct upload limits.
        xhr.timeout = 600000;
        //Send the upload ID along with the file metadata so the server knows what to assemble.
        xhr.send(JSON.stringify({ uploadId: uploadId, fileName: file.name, mimeType: file.type }));
    });
}

//Collect all form field values from the current modal into an object (for batch state tracking).
function collectModalFormData(doc) {
    //Start with an empty body and populate it from the form fields below.
    var body = {};
    var formData = new FormData(modalForm);
    for (const [key, value] of formData.entries()) {
        //Copy each form field straight onto the body object.
        body[key] = value;
    }

    //Checkboxes.
    var checkboxes = modalFields.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
        //Capture each checkbox state explicitly since FormData skips unchecked boxes.
        body[checkbox.name] = checkbox.checked;
    }

    //Tags from picker.
    var tagPills = modalFields.querySelectorAll('.tag-pill');
    var tags = [];
    for (const pill of tagPills) {
        //Pull the tag name out of the pill's data attribute.
        tags.push(pill.getAttribute('data-tag'));
    }
    body.tags = tags;

    //Galleries.
    var galleryInputs = modalFields.querySelectorAll('.gallery-entry');
    var galleries = [];
    for (const entry of galleryInputs) {
        //Read the trimmed gallery name from each entry.
        var gName = entry.querySelector('.gallery-name-input').value.trim();
        if (gName) {
            //Build a gallery object with a URL-safe slug, the display name, and a default position.
            galleries.push({
                gallerySlug: gName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                galleryName: gName,
                galleryPosition: 1
            });
        }
    }
    body.galleries = galleries;

    //Location.
    body.location = {
        //Pull each location field out of its dedicated input, defaulting to empty when missing.
        city: (document.getElementById('field-location-city') || {}).value || '',
        state: (document.getElementById('field-location-state') || {}).value || '',
        country: (document.getElementById('field-location-country') || {}).value || ''
    };
    //Strip the flat location fields off the body so I don't double up the structured location object above.
    delete body['location-city'];
    delete body['location-state'];
    delete body['location-country'];
    //Strip the gallery-name field too since the structured galleries array supersedes it.
    delete body['gallery-name'];

    //CapturedAt. Append 'Z' so the value is parsed as UTC (matching how it was
    //rendered into the input from UTC components). Without 'Z', new Date()
    //parses as local time and the timestamp drifts by the user's TZ offset on
    //every save — which then triggers spurious file renames.
    var capturedInput = document.getElementById('field-capturedAt');
    if (capturedInput) {
        //Convert the datetime-local value into an ISO string treated as UTC, or null when the field is empty.
        body.capturedAt = capturedInput.value
            ? new Date(capturedInput.value + 'Z').toISOString()
            : null;
    }

    //Hand the populated body object back to the caller.
    return body;
}

//Send the collected form data to the server via PUT to persist a media item.
function saveMediaItem(docId, body) {
    return apiCall('/api/media/' + docId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

//Run the batch entry flow for all uploaded items. Shows one item at a time with progress and Back/Next navigation.
function runBatchEntry(uploadResults) {
    //Wrap the whole flow in a Promise so the caller can await the entire batch session.
    return new Promise(function (batchResolve) {
        //Hold the upload results array under a stable name for use inside the closures below.
        var batchItems = uploadResults;
        //Cache the total count so we can show progress and detect the last item.
        var batchTotal = batchItems.length;
        //Stores the curator's form data per item so Back navigation can restore their in-progress entries.
        var batchEdits = new Array(batchTotal).fill(null);
        //Track which item is currently on screen.
        var batchIndex = 0;

        //Render the batch entry modal for the item at the given index.
        function showItem(index) {
            //Update the closure-tracked index so handlers know which item is current.
            batchIndex = index;
            //Pull the upload result for this slot.
            var result = batchItems[index];
            //The pre-saved server document this entry corresponds to.
            var doc = result.document;
            //Auto-detected tags from the upload pipeline (EXIF, filename heuristics, etc.).
            var autoTags = result.autoTags;
            //If the curator has already filled in this item once and used Back to return, restore those values.
            var saved = batchEdits[index];

            //Mark this as a media edit so the shared submit handler routes correctly.
            currentEditType = 'media';
            //Capture the doc ID so the submit handler knows which record to update.
            currentEditId = doc._id;
            //Wipe any previously rendered fields before rebuilding the form.
            modalFields.innerHTML = '';

            //Build the progress indicator at the top of the modal so curators know how far along they are.
            var progressDiv = document.createElement('div');
            //Apply the batch-progress class for the styled progress strip.
            progressDiv.className = 'batch-progress';
            //Inline both the textual count and the progress bar fill in one go.
            progressDiv.innerHTML =
                //Text label showing the current item position.
                '<span class="batch-progress-text">Item ' + (index + 1) + ' of ' + batchTotal + '</span>' +
                //Progress bar whose fill width is the percentage complete.
                '<div class="batch-progress-bar-wrap"><div class="batch-progress-bar" style="width:' + Math.round(((index + 1) / batchTotal) * 100) + '%"></div></div>';
            //Drop the progress block into the modal.
            modalFields.appendChild(progressDiv);

            //Show a preview of the uploaded media at the top so the curator can see what they're labeling.
            if (doc.displayResolutionPath) {
                //Pull just the filename off the stored display path.
                var displayFile = doc.displayResolutionPath.split('/').pop();
                //Wrapper div for the preview so styling and removal are easy.
                var previewDiv = document.createElement('div');
                //Apply the upload-preview class for the standard preview styling.
                previewDiv.className = 'upload-preview';
                if (doc.mediaType === 'video') {
                    //Videos get a controls-enabled muted player so the curator can scrub through.
                    previewDiv.innerHTML = '<video class="upload-preview-media" src="/media/' + encodeURIComponent(displayFile) + '" controls muted preload="metadata"></video>';
                } else {
                    //Photos get a plain img tag.
                    previewDiv.innerHTML = '<img class="upload-preview-media" src="/media/' + encodeURIComponent(displayFile) + '" alt="Preview">';
                }
                //Drop the preview into the modal.
                modalFields.appendChild(previewDiv);
            }

            //Surface the auto-detected tags as informational text so the curator knows what was guessed.
            if (autoTags && autoTags.length) {
                //Wrapper div for the auto-tags info line.
                var infoDiv = document.createElement('div');
                //Apply the styling class for the info bar.
                infoDiv.className = 'auto-tags-info';
                //Render the comma-joined tag list.
                infoDiv.textContent = 'Auto-detected tags: ' + autoTags.join(', ');
                //Drop the info line into the modal.
                modalFields.appendChild(infoDiv);
            }

            //Title field, intentionally blank on first visit so curators don't accept the filename as the title.
            var titleGroup = createField('Title *', 'title', 'text', saved ? saved.title || '' : '', true);
            //Add the title field.
            modalFields.appendChild(titleGroup);
            //Description field, restored from saved edits when navigating back.
            modalFields.appendChild(createField('Description *', 'description', 'textarea', saved ? saved.description || '' : '', true));
            //Alt-text field, mirrors the title until the curator edits it manually.
            var altGroup = createField('Alt Text *', 'alt', 'text', saved ? saved.alt || '' : '', true);
            //Add the alt field.
            modalFields.appendChild(altGroup);

            //Wire title to alt auto-fill. Track whether the curator has touched the alt field manually.
            var titleInput = titleGroup.querySelector('input');
            //Reach into the alt group to grab the actual input element.
            var altInput = altGroup.querySelector('input');
            //Start with auto-fill enabled.
            var altManuallyEdited = false;
            //When restoring a saved entry where alt diverged from title, treat alt as manually edited so it stays put.
            if (saved && saved.alt && saved.title && saved.alt !== saved.title) {
                //Disable auto-fill since alt was previously customized.
                altManuallyEdited = true;
            }
            //As soon as the curator types in alt, lock auto-fill off.
            altInput.addEventListener('input', function () {
                //Mark alt as manually edited so future title changes don't clobber it.
                altManuallyEdited = true;
            });
            //Mirror title changes into alt only while alt hasn't been manually touched.
            titleInput.addEventListener('input', function () {
                //Only sync when alt is still on auto-fill.
                if (!altManuallyEdited) {
                    //Copy the title value into the alt field.
                    altInput.value = titleInput.value;
                }
            });

            //Creator field, defaulting to Scott Short when neither saved edits nor the doc supply a value.
            modalFields.appendChild(createField('Creator', 'creator', 'text', saved ? saved.creator || 'Scott Short' : doc.creator || 'Scott Short', false));

            //Pre-fill the captured-at value from saved edits or the doc's metadata, formatted for the datetime-local input.
            var capturedVal = '';
            if (saved && saved.capturedAt) {
                //Saved edits take priority so the curator's manual override survives Back navigation.
                var cd = new Date(saved.capturedAt);
                //Guard against invalid dates that would otherwise crash the formatting below.
                if (!isNaN(cd.getTime())) {
                    //Format as YYYY-MM-DDTHH:MM:SS in UTC.
                    capturedVal = cd.getUTCFullYear() + '-' +
                        String(cd.getUTCMonth() + 1).padStart(2, '0') + '-' +
                        String(cd.getUTCDate()).padStart(2, '0') + 'T' +
                        String(cd.getUTCHours()).padStart(2, '0') + ':' +
                        String(cd.getUTCMinutes()).padStart(2, '0') + ':' +
                        String(cd.getUTCSeconds()).padStart(2, '0');
                }
            } else if (doc.capturedAt) {
                //Fall back to the auto-extracted timestamp from the upload pipeline.
                var cd = new Date(doc.capturedAt);
                //Same UTC format as above so the input picks it up cleanly.
                capturedVal = cd.getUTCFullYear() + '-' +
                    String(cd.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(cd.getUTCDate()).padStart(2, '0') + 'T' +
                    String(cd.getUTCHours()).padStart(2, '0') + ':' +
                    String(cd.getUTCMinutes()).padStart(2, '0') + ':' +
                    String(cd.getUTCSeconds()).padStart(2, '0');
            }
            //Add the Captured Date/Time field with the formatted value.
            modalFields.appendChild(createField('Captured Date/Time', 'capturedAt', 'datetime-local', capturedVal, false));

            //Tag picker pre-filled from saved edits, the doc, or auto-detected tags in that order.
            modalFields.appendChild(createTagPicker(saved ? saved.tags || [] : doc.tags || autoTags || []));

            //Gallery input pre-filled from saved edits, otherwise empty for the curator to fill in.
            modalFields.appendChild(createGalleryInput(saved ? saved.galleries || [] : []));

            //Section label so the three location fields read as a group.
            var locLabel = document.createElement('label');
            //Set the label text.
            locLabel.textContent = 'Location';
            //Use the section-label class so it stands apart from regular field labels.
            locLabel.className = 'section-label';
            //Drop the section label into the modal.
            modalFields.appendChild(locLabel);
            //City field, restored from saved edits when present.
            modalFields.appendChild(createField('City', 'location-city', 'text', saved && saved.location ? saved.location.city : '', false));
            //State field, restored from saved edits when present.
            modalFields.appendChild(createField('State', 'location-state', 'text', saved && saved.location ? saved.location.state : '', false));
            //Country field, restored from saved edits when present.
            modalFields.appendChild(createField('Country', 'location-country', 'text', saved && saved.location ? saved.location.country : '', false));

            //Visible flag, defaulting to true on first visit so new uploads show up by default.
            modalFields.appendChild(createField('Visible', 'display', 'checkbox', saved ? saved.display : true, false));
            //Homepage flag, defaulting to true on first visit so new uploads enter the rotation.
            modalFields.appendChild(createField('Show on Homepage', 'showOnHomepage', 'checkbox', saved ? saved.showOnHomepage : true, false));
            //Recent flag, defaulting to true on first visit so new uploads appear in the recent slot.
            modalFields.appendChild(createField('Show in Recent', 'showInRecent', 'checkbox', saved ? saved.showInRecent : true, false));
            //Featured flag, off by default so curators have to explicitly opt in.
            modalFields.appendChild(createField('Featured', 'featured', 'checkbox', saved ? saved.featured : false, false));

            //Show or hide the Back button depending on whether there's a previous item to return to.
            var backBtn = document.getElementById('modalBackBtn');
            if (backBtn) {
                //Only show Back from the second item onward.
                backBtn.style.display = index > 0 ? 'inline-block' : 'none';
            }

            //Open the modal with a title that includes the current position in the batch.
            openModal('Complete Media Details \u2014 Item ' + (index + 1) + ' of ' + batchTotal);
        }

        //Tear down all batch-specific event listeners so they don't leak into the next modal session.
        function cleanupListeners() {
            //Detach the submit handler from the form.
            modalForm.removeEventListener('submit', handleSave);
            //Re-enable the global submit handler now that the batch handler is gone.
            batchEntryActive = false;
            //Look up the Back button so we can detach its handler too.
            var backBtn = document.getElementById('modalBackBtn');
            if (backBtn) {
                //Detach the Back handler.
                backBtn.removeEventListener('click', handleBack);
                //Hide the Back button so it doesn't linger on subsequent non-batch modals.
                backBtn.style.display = 'none';
            }
            //Detach the X-button handler.
            document.getElementById('modalCloseBtn').removeEventListener('click', handleCancel);
            //Detach the Cancel-button handler.
            document.getElementById('modalCancelBtn').removeEventListener('click', handleCancel);
        }

        //Save handler: persist the current item, then advance to the next or finish the batch.
        function handleSave(event) {
            //Stop the form's default submission since we're handling the save manually.
            event.preventDefault();
            //Pull the current form values into a body object suitable for the API.
            var body = collectModalFormData(batchItems[batchIndex].document);
            //Cache the body in case the curator hits Back later and we want to restore.
            batchEdits[batchIndex] = body;

            //Fire the save request for this item.
            saveMediaItem(batchItems[batchIndex].document._id, body).then(function (resp) {
                if (resp.ok) {
                    //Refresh the tag cache so the next item's picker has any new tags this curator just added.
                    fetchAllTags();
                    if (batchIndex < batchTotal - 1) {
                        //More items to go, advance to the next one.
                        showItem(batchIndex + 1);
                    } else {
                        //Last item, tear down listeners and close the modal.
                        cleanupListeners();
                        //Hide the modal.
                        closeModal();
                        //Resolve the outer Promise so the caller can move on.
                        batchResolve();
                    }
                } else {
                    //Non-OK response, parse the error and surface it to the curator.
                    resp.json().then(function (data) {
                        //Alert with the server error or a fallback message.
                        alert(data.error || 'Failed to save.');
                    });
                }
            }).catch(function () {
                //Network error or similar exception, show a generic message.
                alert('Error saving media details.');
            });
        }

        //Back handler: snapshot the current form values without persisting, then move to the previous item.
        function handleBack() {
            //Capture whatever the curator has typed so far so it survives the round trip.
            batchEdits[batchIndex] = collectModalFormData(batchItems[batchIndex].document);
            //Re-render the previous item.
            showItem(batchIndex - 1);
        }

        //Cancel/Close handler: confirm if there are items left, then resolve the batch.
        function handleCancel() {
            //Compute how many items are still unsaved.
            var remaining = batchTotal - batchIndex;
            if (remaining > 1) {
                //Confirm before discarding the rest of the batch since the curator may have meant to keep going.
                if (!confirm('You have ' + remaining + ' items remaining in this batch. Skip remaining items?\n\nItems already saved will keep their data. Unsaved items can be edited later from the admin grid.')) {
                    //User declined, leave the modal open and let them keep working.
                    return;
                }
            }
            //Tear down listeners so they don't leak into the next modal.
            cleanupListeners();
            //Hide the modal.
            closeModal();
            //Resolve the outer Promise so the caller can move on.
            batchResolve();
        }

        //Wire up all the batch-specific event listeners on the shared modal elements.
        modalForm.addEventListener('submit', handleSave);
        //Disable the global submit handler so it doesn't double-submit alongside handleSave.
        batchEntryActive = true;
        //Look up the Back button so we can wire it up if it exists.
        var backBtn = document.getElementById('modalBackBtn');
        if (backBtn) {
            //Wire Back to the handler defined above.
            backBtn.addEventListener('click', handleBack);
        }
        //Hook the X button into the cancel flow.
        document.getElementById('modalCloseBtn').addEventListener('click', handleCancel);
        //Hook the Cancel button into the cancel flow.
        document.getElementById('modalCancelBtn').addEventListener('click', handleCancel);

        //Kick the flow off by rendering the first item.
        showItem(0);
    });
}


//Database schema viewer: pulls the schema definitions from the API on first activation of the tab and renders them as cards.
var schemaLoaded = false;

async function loadSchema() {
    //Only fetch once per session — schema doesn't change at runtime.
    if (schemaLoaded) return;

    //Grab the schema container and seed it with a loading placeholder.
    var container = document.getElementById('schemaContainer');
    container.innerHTML = '<p class="loading-text">Loading schema...</p>';

    try {
        //Hit the schema endpoint to pull down the model definitions.
        var response = await fetch('/api/schema');
        if (response.status === 401) {
            //Session expired, kick the user back to the login page.
            window.location.href = '/login';
            return;
        }
        //Parse the JSON body into an array of collection schemas.
        var collections = await response.json();
        //Mark the schema as loaded so I don't re-fetch on subsequent tab switches.
        schemaLoaded = true;
        //Hand the parsed schemas off to the renderer.
        renderSchema(collections);
    } catch (error) {
        //Network or parse error, show a friendly failure message.
        container.innerHTML = '<p class="loading-text">Failed to load schema.</p>';
    }
}

//Render schema data as cards with field tables.
function renderSchema(collections) {
    //Grab the container and wipe whatever placeholder was in it.
    var container = document.getElementById('schemaContainer');
    container.innerHTML = '';

    //Iterate over each collection and build a card for it.
    for (var i = 0; i < collections.length; i++) {
        //Pull the current collection out of the array.
        var col = collections[i];
        //Build the card wrapper for this collection.
        var card = document.createElement('div');
        card.className = 'schema-card';

        //Card header with model name, collection name, and doc count.
        var header = document.createElement('div');
        header.className = 'schema-card-header';
        header.innerHTML =
            '<h3>' + escapeHtml(col.name) + ' <span class="schema-doc-count">(' + col.docCount + ' docs)</span></h3>' +
            '<span class="schema-collection-name">' + escapeHtml(col.collection) + '</span>';
        card.appendChild(header);

        //Card body with field table.
        var body = document.createElement('div');
        body.className = 'schema-card-body';

        //Build the table that will list each field in this collection.
        var table = document.createElement('table');
        table.className = 'schema-table';

        //Table header.
        var thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Field</th><th>Type</th><th>Notes</th></tr>';
        table.appendChild(thead);

        //Table body with field rows.
        var tbody = document.createElement('tbody');
        buildFieldRows(tbody, col.fields, 0);
        table.appendChild(tbody);

        //Stitch the table into the body, the body into the card, and the card into the container.
        body.appendChild(table);
        card.appendChild(body);
        container.appendChild(card);
    }
}

//Build table rows for schema fields, including nested subdocument fields with toggle.
function buildFieldRows(tbody, fields, depth) {
    //Walk each field at this depth and emit a table row for it.
    for (var j = 0; j < fields.length; j++) {
        //Pull the current field definition.
        var field = fields[j];
        //Build the table row for this field.
        var tr = document.createElement('tr');

        //Field name cell.
        var tdName = document.createElement('td');
        var nameSpan = document.createElement('span');
        nameSpan.className = 'schema-field-name';
        nameSpan.textContent = field.name;

        if (depth > 0) {
            //Nested fields are indented and shaded so the hierarchy is visible.
            tdName.style.paddingLeft = (depth * 1.2 + 0.8) + 'rem';
            tdName.style.background = '#f9f9f5';
        }

        //If field has nested subdocuments, add a toggle.
        if (field.nested && field.nested.length > 0) {
            //Add the toggle class so I can style this name as clickable.
            nameSpan.className += ' schema-nested-toggle';
            //Build a small triangle icon that flips when the row is expanded.
            var icon = document.createElement('i');
            icon.className = 'toggle-icon';
            icon.textContent = '\u25B6';
            //Insert the icon at the start of the name span with a space after it.
            nameSpan.insertBefore(icon, nameSpan.firstChild);
            nameSpan.insertBefore(document.createTextNode(' '), nameSpan.childNodes[1]);
        }

        //Drop the name span into its cell, and the cell into the row.
        tdName.appendChild(nameSpan);
        tr.appendChild(tdName);

        //Type cell holding the field's data type.
        var tdType = document.createElement('td');
        //Inner span so the type text can be styled distinctly from the cell.
        var typeSpan = document.createElement('span');
        //Apply the schema-field-type class for the standard type styling.
        typeSpan.className = 'schema-field-type';
        //Set the type text from the field definition.
        typeSpan.textContent = field.type;
        //Shade nested cells so the indentation reads as a hierarchy.
        if (depth > 0) { tdType.style.background = '#f9f9f5'; }
        //Drop the type span into its cell, then the cell into the row.
        tdType.appendChild(typeSpan);
        tr.appendChild(tdType);

        //Notes cell holding aggregated schema flags like required, unique, default.
        var tdNote = document.createElement('td');
        //Match the type cell shading for nested rows.
        if (depth > 0) { tdNote.style.background = '#f9f9f5'; }
        //Collect the relevant schema flags into a single notes string.
        var notes = [];
        //Required flag.
        if (field.required) notes.push('required');
        //Unique flag.
        if (field.unique) notes.push('unique');
        //Default value note when one is configured.
        if (field.defaultValue !== undefined) notes.push('default: ' + field.defaultValue);
        if (notes.length > 0) {
            //Render the notes inside a styled span so they stand out from the type column.
            var noteSpan = document.createElement('span');
            //Apply the standard note styling class.
            noteSpan.className = 'schema-field-note';
            //Comma-separate the collected flags.
            noteSpan.textContent = notes.join(', ');
            //Drop the span into the cell.
            tdNote.appendChild(noteSpan);
        }
        //Append the notes cell to the row.
        tr.appendChild(tdNote);

        //Append the completed row into the table body.
        tbody.appendChild(tr);

        //If field has nested subdocuments, add nested rows (hidden by default) and wire up the toggle.
        if (field.nested && field.nested.length > 0) {
            //Track each nested row so I can show/hide them as a group when the toggle is clicked.
            var nestedRows = [];
            //Recursively render the nested fields one level deeper, populating nestedRows.
            buildNestedRows(tbody, field.nested, depth + 1, nestedRows);

            //Wire the toggle click handler. IIFE captures the current span and rows for this field.
            (function (toggleSpan, rows) {
                toggleSpan.addEventListener('click', function () {
                    //Read the current state, flip the open class, then sync the row visibility to match.
                    var isOpen = toggleSpan.classList.contains('open');
                    //Flip the open class so the icon rotation styling updates.
                    toggleSpan.classList.toggle('open');
                    //Show or hide every tracked nested row based on the previous state.
                    for (var r = 0; r < rows.length; r++) {
                        rows[r].style.display = isOpen ? 'none' : '';
                    }
                });
            })(nameSpan, nestedRows);
        }
    }
}

//Build nested field rows and track them for toggle visibility. Hidden by default.
function buildNestedRows(tbody, fields, depth, rowTracker) {
    //Walk each nested field and emit a hidden row for it that the parent toggle can reveal.
    for (var j = 0; j < fields.length; j++) {
        //Pull the current field definition.
        var field = fields[j];
        //Build the table row, hidden by default until the parent is expanded.
        var tr = document.createElement('tr');
        //Hide the row up front; the parent toggle will flip it visible.
        tr.style.display = 'none';
        //Track this row so the parent toggle handler can flip its visibility.
        rowTracker.push(tr);

        //Name cell, indented and shaded to show the hierarchy.
        var tdName = document.createElement('td');
        //Indentation grows with depth so deeply nested fields visibly cascade.
        tdName.style.paddingLeft = (depth * 1.2 + 0.8) + 'rem';
        //Shade the cell so nested rows stand out from the top-level rows.
        tdName.style.background = '#f9f9f5';
        //Inner span so the name text can be styled separately from the cell.
        var nameSpan = document.createElement('span');
        //Standard schema-field-name class for the styling.
        nameSpan.className = 'schema-field-name';
        //Set the name text from the field definition.
        nameSpan.textContent = field.name;
        //Drop the span into the cell, then the cell into the row.
        tdName.appendChild(nameSpan);
        tr.appendChild(tdName);

        //Type cell, also shaded to match the name cell.
        var tdType = document.createElement('td');
        //Match the name cell shading.
        tdType.style.background = '#f9f9f5';
        //Inner span for the type text.
        var typeSpan = document.createElement('span');
        //Standard type styling class.
        typeSpan.className = 'schema-field-type';
        //Set the type text from the field definition.
        typeSpan.textContent = field.type;
        //Drop the span into the cell, then the cell into the row.
        tdType.appendChild(typeSpan);
        tr.appendChild(tdType);

        //Notes cell, same shading and same flag aggregation as the top-level renderer.
        var tdNote = document.createElement('td');
        //Match the rest of the nested row shading.
        tdNote.style.background = '#f9f9f5';
        //Collect schema flags into a notes array.
        var notes = [];
        //Required flag.
        if (field.required) notes.push('required');
        //Unique flag.
        if (field.unique) notes.push('unique');
        //Default value note when one is configured.
        if (field.defaultValue !== undefined) notes.push('default: ' + field.defaultValue);
        if (notes.length > 0) {
            //Render the collected notes inside a styled span.
            var noteSpan = document.createElement('span');
            //Standard note styling class.
            noteSpan.className = 'schema-field-note';
            //Comma-separate the collected flags.
            noteSpan.textContent = notes.join(', ');
            //Drop the span into the cell.
            tdNote.appendChild(noteSpan);
        }
        //Append the notes cell to the row.
        tr.appendChild(tdNote);

        //Append the completed nested row into the table body.
        tbody.appendChild(tr);
    }
}


//Query shell: lets the admin run ad-hoc read-only queries against any of the tracked collections.

(function () {
    //Cache references to all the query shell DOM elements up front so I don't have to re-query them on every interaction.
    var operationSelect = document.getElementById('queryOperation');
    //Update document group, shown only for updateOne/updateMany.
    var updateGroup = document.getElementById('queryUpdateGroup');
    //Projection group, shown only for find/findOne.
    var projectionGroup = document.getElementById('queryProjectionGroup');
    //Sort group, shown only for find.
    var sortGroup = document.getElementById('querySortGroup');
    //Limit input, shown only for find.
    var limitInput = document.getElementById('queryLimit');
    //Main filter/pipeline/document textarea (reused across operations).
    var filterTextarea = document.getElementById('queryFilter');
    //Update document textarea.
    var updateTextarea = document.getElementById('queryUpdate');
    //Projection textarea.
    var projectionTextarea = document.getElementById('queryProjection');
    //Sort textarea.
    var sortTextarea = document.getElementById('querySort');
    //Run button that fires the query.
    var runBtn = document.getElementById('queryRunBtn');
    //Clear button that resets every input and result.
    var clearBtn = document.getElementById('queryClearBtn');
    //Status line above the results pane.
    var statusEl = document.getElementById('queryStatus');
    //Results pane that holds the formatted output.
    var resultsEl = document.getElementById('queryResults');
    //Result count label that summarizes the response.
    var resultCountEl = document.getElementById('queryResultCount');
    //Collection picker that targets which collection the query runs against.
    var collectionSelect = document.getElementById('queryCollection');

    //Show/hide fields based on operation type.
    function updateVisibleFields() {
        //Read the currently selected operation so I can decide which fields are relevant.
        var op = operationSelect.value;
        //Update operations need an update document, find operations support projection/sort/limit.
        var needsUpdate = (op === 'updateOne' || op === 'updateMany');
        var needsProjection = (op === 'find' || op === 'findOne');
        var needsSort = (op === 'find');
        var needsLimit = (op === 'find');

        //Toggle each optional field group based on the flags above.
        updateGroup.style.display = needsUpdate ? '' : 'none';
        projectionGroup.style.display = needsProjection ? '' : 'none';
        sortGroup.style.display = needsSort ? '' : 'none';
        limitInput.closest('.query-field').style.display = needsLimit ? '' : 'none';

        //Update filter label based on operation.
        var filterLabel = filterTextarea.previousElementSibling || filterTextarea.parentElement.querySelector('label');
        if (op === 'aggregate') {
            //Aggregate uses a pipeline array rather than a filter object.
            filterLabel.innerHTML = 'Pipeline <span class="query-hint">JSON array</span>';
            filterTextarea.placeholder = '[{"$match": {"type": "photo"}}, {"$group": {"_id": "$type", "count": {"$sum": 1}}}]';
        } else if (op === 'insertOne') {
            //Insert uses a single document rather than a filter.
            filterLabel.innerHTML = 'Document <span class="query-hint">JSON</span>';
            filterTextarea.placeholder = '{"field": "value"}';
        } else {
            //All other operations use a standard MongoDB filter document.
            filterLabel.innerHTML = 'Filter <span class="query-hint">JSON</span>';
            filterTextarea.placeholder = '{"type": "photo"}';
        }
    }

    //Re-evaluate which fields should be visible whenever the operation changes, and run it once on load.
    operationSelect.addEventListener('change', updateVisibleFields);
    updateVisibleFields();

    //Parse JSON from a textarea, returning null on empty, throwing on invalid.
    function parseJson(textarea, label) {
        //Trim the textarea value so blank-with-whitespace counts as empty.
        var text = textarea.value.trim();
        if (!text) return null;
        try {
            //Parse the JSON and hand it back.
            return JSON.parse(text);
        } catch (e) {
            //Wrap the parse error with the field label so the user knows which textarea has the problem.
            throw new Error('Invalid JSON in ' + label + ': ' + e.message);
        }
    }

    //Run query.
    runBtn.addEventListener('click', async function () {
        //Reset the status, result, and count display before running a fresh query.
        statusEl.textContent = 'Running...';
        statusEl.className = 'query-status';
        resultsEl.textContent = '';
        resultCountEl.textContent = '';
        //Disable the Run button so the user can't fire off a second query while this one is in flight.
        runBtn.disabled = true;

        try {
            //Read the chosen operation and parse the filter (defaulting to the right empty value for each op).
            var op = operationSelect.value;
            //Parse the filter textarea; aggregate defaults to empty pipeline, everything else to empty object.
            var filter = parseJson(filterTextarea, 'Filter') || (op === 'aggregate' ? [] : {});
            //Build the request payload with the common fields.
            var payload = {
                //Target collection.
                collection: collectionSelect.value,
                //Operation to run.
                operation: op,
                //Filter/pipeline/document depending on operation.
                filter: filter,
                //Default limit to 20 if the input is empty or not numeric.
                limit: parseInt(limitInput.value) || 20
            };

            if (op === 'updateOne' || op === 'updateMany') {
                //Update operations require an update document; surface a clear error if it's missing.
                var update = parseJson(updateTextarea, 'Update');
                if (!update) {
                    //No update document supplied, bail with a clear error.
                    throw new Error('Update field is required for ' + op);
                }
                //Attach the update document to the payload.
                payload.update = update;
            }

            if (op === 'find' || op === 'findOne') {
                //Optional projection for find/findOne.
                var proj = parseJson(projectionTextarea, 'Projection');
                //Only include projection if the user supplied one.
                if (proj) payload.projection = proj;
            }

            if (op === 'find') {
                //Optional sort for find.
                var sort = parseJson(sortTextarea, 'Sort');
                //Only include sort if the user supplied one.
                if (sort) payload.sort = sort;
            }

            //Send the assembled payload to the query endpoint.
            var response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            //Parse the JSON response body.
            var data = await response.json();

            if (!response.ok) {
                //Surface the server-reported error in the status and results area.
                statusEl.textContent = 'Error';
                //Apply the error styling.
                statusEl.className = 'query-status error';
                //Show the server message (or a generic fallback) in the results pane.
                resultsEl.textContent = data.error || 'Query failed';
                return;
            }

            //Pretty-print the result so it's readable in the results pane.
            var result = data.result;
            //Two-space indent for readability.
            var formatted = JSON.stringify(result, null, 2);
            //Push the formatted JSON into the results pane.
            resultsEl.textContent = formatted;

            //Show result count.
            if (Array.isArray(result)) {
                //Find/aggregate returns an array, show the document count.
                resultCountEl.textContent = result.length + ' document' + (result.length !== 1 ? 's' : '');
            } else if (typeof result === 'number') {
                //Count operations return a number.
                resultCountEl.textContent = 'Count: ' + result;
            } else if (result && typeof result === 'object' && result.matchedCount !== undefined) {
                //Update operations return an object with matched/modified counts.
                resultCountEl.textContent = 'Matched: ' + result.matchedCount + ', Modified: ' + result.modifiedCount;
            } else if (result && typeof result === 'object' && result.deletedCount !== undefined) {
                //Delete operations return an object with a deleted count.
                resultCountEl.textContent = 'Deleted: ' + result.deletedCount;
            } else if (result && result._id) {
                //findOne/insertOne returns a single document.
                resultCountEl.textContent = '1 document';
            } else {
                //Anything else, leave the count blank.
                resultCountEl.textContent = '';
            }

            //Mark the run as successful in the status area.
            statusEl.textContent = 'Done';
            statusEl.className = 'query-status';

        } catch (error) {
            //Surface any client-side error (parse failure, network error, etc.) in the status and results panes.
            statusEl.textContent = 'Error';
            statusEl.className = 'query-status error';
            resultsEl.textContent = error.message;
        } finally {
            //Always re-enable the Run button when the query finishes, regardless of success or failure.
            runBtn.disabled = false;
        }
    });

    //Clear all fields and results.
    clearBtn.addEventListener('click', function () {
        //Wipe every textarea and result display back to its empty state.
        filterTextarea.value = '';
        //Clear update textarea.
        updateTextarea.value = '';
        //Clear projection textarea.
        projectionTextarea.value = '';
        //Clear sort textarea.
        sortTextarea.value = '';
        //Reset the results pane to its empty placeholder.
        resultsEl.textContent = 'Run a query to see results here.';
        //Wipe the count label.
        resultCountEl.textContent = '';
        //Wipe the status line.
        statusEl.textContent = '';
        //Reset the status styling back to neutral.
        statusEl.className = 'query-status';
    });

    //Tab key inserts spaces instead of moving focus in textareas.
    var textareas = document.querySelectorAll('.query-textarea');
    for (var i = 0; i < textareas.length; i++) {
        //Wire each query textarea so Tab inserts two spaces rather than moving focus to the next element.
        textareas[i].addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                //Stop the browser's default focus-shift behavior.
                e.preventDefault();
                //Insert two spaces at the current cursor position and move the cursor past them.
                var start = this.selectionStart;
                //Capture the selection end so I can replace any selected range, not just insert at a single point.
                var end = this.selectionEnd;
                //Splice two spaces in over the current selection.
                this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
                //Park the cursor immediately after the inserted spaces.
                this.selectionStart = this.selectionEnd = start + 2;
            }
        });
    }
})();
