/*!
 * Copyright 2012, Chris Wanstrath
 * Released under the MIT License
 * https://github.com/defunkt/jquery-djax
 */

(function($){

// When called on a container with a selector, fetches the href with
// ajax into the container or with the data-djax attribute on the link
// itself.
//
// Tries to make sure the back button and ctrl+click work the way
// you'd expect.
//
// Exported as $.fn.djax
//
// Accepts a jQuery ajax options object that may include these
// djax specific options:
//
//
// container - Where to stick the response body. Usually a String selector.
//             $(container).html(xhr.responseBody)
//             (default: current jquery context)
//      push - Whether to pushState the URL. Defaults to true (of course).
//   replace - Want to use replaceState instead? That's cool.
//   history - Work with window.history. Defaults to true
//   cache   - Whether to cache pages HTML. Defaults to true
//
// For convenience the second parameter can be either the container or
// the options object.
//
// Returns the jQuery object
function fnDjax(selector, container, options) {
  var context = this
  return this.on('click.djax', selector, function(event) {
    var opts = $.extend({history: true}, optionsFor(container, options));
	if($(this).data('push') == 1) {
		opts.push = true;
		opts.pushUrl = $(this).data('pushurl');
	}
    if (!opts.container)
      opts.container = $(this).attr('data-djax') || context
    handleClick(event, opts)
  })
}

// Public: djax on click handler
//
// Exported as $.djax.click.
//
// event   - "click" jQuery.Event
// options - djax options
//
// If the click event target has 'data-djax="0"' attribute, the event is ignored, and no djax call is made.
//
// Examples
//
//   $(document).on('click', 'a', $.djax.click)
//   // is the same as
//   $(document).djax('a')
//
//  $(document).on('click', 'a', function(event) {
//    var container = $(this).closest('[data-djax-container]')
//    $.djax.click(event, container)
//  })
//
// Returns nothing.
function handleClick(event, container, options) {
  options = optionsFor(container, options)

  var link = event.currentTarget

  // Ignore links with data-djax="0"
  if ($(link).data('djax') == 0) {
    return;
  }

  if (link.tagName.toUpperCase() !== 'A')
    throw "$.fn.djax or $.djax.click requires an anchor element"

  // Middle click, cmd click, and ctrl click should open
  // links in a new tab as normal.
  if ( event.which > 1 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey )
    return

  // Ignore cross origin links
  if ( location.protocol !== link.protocol || location.hostname !== link.hostname )
    return

  // Ignore case when a hash is being tacked on the current URL
  if ( $(link).data('href').indexOf('#') > -1 && stripHash(link) == stripHash(location) )
    return

  // Ignore event with default prevented
  if (event.isDefaultPrevented())
    return

  var defaults = {
    url: $(link).data('href'),
    container: $(link).attr('data-djax'),
    target: link
  }

  var opts = $.extend({}, defaults, options)
  var clickEvent = $.Event('djax:click')
  $(link).trigger(clickEvent, [opts])

  if (!clickEvent.isDefaultPrevented()) {
    djax(opts)
    event.preventDefault()
    $(link).trigger('djax:clicked', [opts])
  }
}

// Public: djax on form submit handler
//
// Exported as $.djax.submit
//
// event   - "click" jQuery.Event
// options - djax options
//
// Examples
//
//  $(document).on('submit', 'form', function(event) {
//    var container = $(this).closest('[data-djax-container]')
//    $.djax.submit(event, container)
//  })
//
// Returns nothing.
function handleSubmit(event, container, options) {
  options = optionsFor(container, options)

  var form = event.currentTarget

  if (form.tagName.toUpperCase() !== 'FORM')
    throw "$.djax.submit requires a form element"

  var defaults = {
    type: form.method.toUpperCase(),
    url: form.action,
    container: $(form).attr('data-djax'),
    target: form
  }

  if (defaults.type !== 'GET' && window.FormData !== undefined) {
    defaults.data = new FormData(form);
    defaults.processData = false;
    defaults.contentType = false;
  } else {
    // Can't handle file uploads, exit
    if ($(form).find(':file').length) {
      return;
    }

    // Fallback to manually serializing the fields
    defaults.data = $(form).serializeArray();
  }

  djax($.extend({}, defaults, options))

  event.preventDefault()
}

// Loads a URL with ajax, puts the response body inside a container,
// then pushState()'s the loaded URL.
//
// Works just like $.ajax in that it accepts a jQuery ajax
// settings object (with keys like url, type, data, etc).
//
// Accepts these extra keys:
//
// container - Where to stick the response body.
//             $(container).html(xhr.responseBody)
//      push - Whether to pushState the URL. Defaults to true (of course).
//   replace - Want to use replaceState instead? That's cool.
//
// Use it just like $.ajax:
//
//   var xhr = $.djax({ url: this.href, container: '#main' })
//   console.log( xhr.readyState )
//
// Returns whatever $.ajax returns.
function djax(options) {
  options = $.extend(true, {}, $.ajaxSettings, djax.defaults, options)

  if ($.isFunction(options.url)) {
    options.url = options.url()
  }

  var target = options.target

  var hash = parseURL(options.url).hash

  var context = options.context = findContainerFor(options.container)

  // We want the browser to maintain two separate internal caches: one
  // for djax'd partial page loads and one for normal page loads.
  // Without adding this secret parameter, some browsers will often
  // confuse the two.
  if (!options.data) options.data = {}
  if ($.isArray(options.data)) {
    options.data.push({name: '_djax', value: context.selector})
  } else {
    options.data._djax = context.selector
  }

  function fire(type, args, props) {
    if (!props) props = {}
    props.relatedTarget = target
    var event = $.Event(type, props)
    context.trigger(event, args)
    return !event.isDefaultPrevented()
  }

  var timeoutTimer

  options.beforeSend = function(xhr, settings) {
    // No timeout for non-GET requests
    // Its not safe to request the resource again with a fallback method.
    if (settings.type !== 'GET') {
      settings.timeout = 0
    }

    xhr.setRequestHeader('X-DJAX', 'true')
    xhr.setRequestHeader('X-DJAX-Container', context.selector)

    if (!fire('djax:beforeSend', [xhr, settings]))
      return false

    if (settings.timeout > 0) {
      timeoutTimer = setTimeout(function() {
        if (fire('djax:timeout', [xhr, options]))
          xhr.abort('timeout')
      }, settings.timeout)

      // Clear timeout setting so jquerys internal timeout isn't invoked
      settings.timeout = 0
    }

    var url = parseURL(settings.url)
    url.hash = hash
    options.requestUrl = stripInternalParams($(url).data('href'))
  }

  options.complete = function(xhr, textStatus) {
    if (timeoutTimer)
      clearTimeout(timeoutTimer)

    fire('djax:complete', [xhr, textStatus, options])

    fire('djax:end', [xhr, options])
  }

  options.error = function(xhr, textStatus, errorThrown) {
    var container = extractContainer("", xhr, options)
    // Check redirect status code
	var redirect = (xhr.status >= 301 && xhr.status <= 303)
	// Do not fire djax::error in case of redirect
    var allowed = redirect || fire('djax:error', [xhr, textStatus, errorThrown, options])
    if (redirect || options.type == 'GET' && textStatus !== 'abort' && allowed) {
      locationReplace(container.url)
    }
  }

  options.success = function(data, status, xhr) {
    var previousState = djax.state;

    // If $.djax.defaults.version is a function, invoke it first.
    // Otherwise it can be a static string.
    var currentVersion = (typeof $.djax.defaults.version === 'function') ?
      $.djax.defaults.version() :
      $.djax.defaults.version

    var latestVersion = xhr.getResponseHeader('X-DJAX-Version')

    var container = extractContainer(data, xhr, options)

    var url = parseURL(container.url)
    if (hash) {
      url.hash = hash
      container.url = $(url).data('href')
    }

    // If there is a layout version mismatch, hard load the new url
    if (currentVersion && latestVersion && currentVersion !== latestVersion) {
      locationReplace(container.url)
      return
    }

    // If the new response is missing a body, hard load the page
    if (!container.contents) {
      locationReplace(container.url)
      return
    }

    djax.state = {
      id: options.id || uniqueId(),
      url: container.url,
      title: container.title,
      container: context.selector,
      fragment: options.fragment,
      timeout: options.timeout
    }

    if (options.history && (options.push || options.replace)) {
		if(options.pushUrl) {
			window.history.replaceState(djax.state, container.title, options.pushUrl)
		} else {
			window.history.replaceState(djax.state, container.title, container.url)
		}
    }

    // Clear out any focused controls before inserting new page contents.
    try {
      document.activeElement.blur()
    } catch (e) { }

    if (container.title) document.title = container.title

    fire('djax:beforeReplace', [container.contents, options], {
      state: djax.state,
      previousState: previousState
    })
    context.html(container.contents)

    // FF bug: Won't autofocus fields that are inserted via JS.
    // This behavior is incorrect. So if theres no current focus, autofocus
    // the last field.
    //
    // http://www.w3.org/html/wg/drafts/html/master/forms.html
    var autofocusEl = context.find('input[autofocus], textarea[autofocus]').last()[0]
    if (autofocusEl && document.activeElement !== autofocusEl) {
      autofocusEl.focus();
    }

    executeScriptTags(container.scripts)

    var scrollTo = options.scrollTo

    // Ensure browser scrolls to the element referenced by the URL anchor
    if (hash) {
      var name = decodeURIComponent(hash.slice(1))
      var target = document.getElementById(name) || document.getElementsByName(name)[0]
      if (target) scrollTo = $(target).offset().top
    }

    if (typeof scrollTo == 'number') $(window).scrollTop(scrollTo)

    fire('djax:success', [data, status, xhr, options])
  }


  // Initialize djax.state for the initial page load. Assume we're
  // using the container and options of the link we're loading for the
  // back button to the initial page. This ensures good back button
  // behavior.
  if (!djax.state) {
    djax.state = {
      id: uniqueId(),
      url: window.location.href,
      title: document.title,
      container: context.selector,
      fragment: options.fragment,
      timeout: options.timeout
    }
    window.history.replaceState(djax.state, document.title)
  }

  // Cancel the current request if we're already djaxing
  abortXHR(djax.xhr)

  // Strip _djax parameter from URL, if exists.
  options.url = stripInternalParams(options.url);
  djax.options = options
  var xhr = djax.xhr = $.ajax(options)

  if (xhr.readyState > 0) {
    if (options.history && (options.push && !options.replace)) {
      // Cache current container element before replacing it
      cachePush(djax.state.id, cloneContents(context))
		if(options.pushUrl)
			window.history.pushState(null, "", options.pushUrl)
		else
			window.history.pushState(null, "", options.requestUrl)
    }

    fire('djax:start', [xhr, options])
    fire('djax:send', [xhr, options])
  }

  return djax.xhr
}

// Public: Reload current page with djax.
//
// Returns whatever $.djax returns.
function djaxReload(container, options) {
  var defaults = {
    url: window.location.href,
    push: false,
    replace: true,
    scrollTo: false
  }

  return djax($.extend(defaults, optionsFor(container, options)))
}

// Internal: Hard replace current state with url.
//
// Work for around WebKit
//   https://bugs.webkit.org/show_bug.cgi?id=93506
//
// Returns nothing.
function locationReplace(url) {
  if(!djax.options.history) return;
  window.history.replaceState(null, "", djax.state.url)
  window.location.replace(url)
}


var initialPop = true
var initialURL = window.location.href
var initialState = window.history.state

// Initialize $.djax.state if possible
// Happens when reloading a page and coming forward from a different
// session history.
if (initialState && initialState.container) {
  djax.state = initialState
}

// Non-webkit browsers don't fire an initial popstate event
if ('state' in window.history) {
  initialPop = false
}

// popstate handler takes care of the back and forward buttons
//
// You probably shouldn't use djax on pages with other pushState
// stuff yet.
function onDjaxPopstate(event) {

  // Hitting back or forward should override any pending DJAX request.
  if (!initialPop) {
    abortXHR(djax.xhr)
  }

  var previousState = djax.state
  var state = event.state

  if (state && state.container) {
    // When coming forward from a separate history session, will get an
    // initial pop with a state we are already at. Skip reloading the current
    // page.
    if (initialPop && initialURL == state.url) return

    var direction, containerSelector = state.container

    if (previousState) {
      // If popping back to the same state, just skip.
      // Could be clicking back from hashchange rather than a pushState.
      if (previousState.id === state.id) return

      // Since state IDs always increase, we can deduce the navigation direction
      direction = previousState.id < state.id ? 'forward' : 'back'
      if (direction == 'back') containerSelector = previousState.container
    }

    var container = $(containerSelector)
    if (container.length) {
      var contents = cacheMapping[state.id]

      if (previousState) {
        // Cache current container before replacement and inform the
        // cache which direction the history shifted.
        cachePop(direction, previousState.id, cloneContents(container))
      }

      var popstateEvent = $.Event('djax:popstate', {
        state: state,
        direction: direction
      })
      container.trigger(popstateEvent)

      var options = {
        id: state.id,
        url: state.url,
        container: container,
        push: false,
        fragment: state.fragment,
        timeout: state.timeout,
        scrollTo: false
      }

      if (contents) {
        container.trigger('djax:start', [null, options])

        djax.state = state
        if (state.title) document.title = state.title
        var beforeReplaceEvent = $.Event('djax:beforeReplace', {
          state: state,
          previousState: previousState
        })
        container.trigger(beforeReplaceEvent, [contents, options])
        container.html(contents)

        container.trigger('djax:end', [null, options])
      } else {
        djax(options)
      }

      // Force reflow/relayout before the browser tries to restore the
      // scroll position.
      container[0].offsetHeight
    } else {
      locationReplace(location.href)
    }
  }
  initialPop = false
}

// Fallback version of main djax function for browsers that don't
// support pushState.
//
// Returns nothing since it retriggers a hard form submission.
function fallbackDjax(options) {
  var url = $.isFunction(options.url) ? options.url() : options.url,
      method = options.type ? options.type.toUpperCase() : 'GET'

  var form = $('<form>', {
    method: method === 'GET' ? 'GET' : 'POST',
    action: url,
    style: 'display:none'
  })

  if (method !== 'GET' && method !== 'POST') {
    form.append($('<input>', {
      type: 'hidden',
      name: '_method',
      value: method.toLowerCase()
    }))
  }

  var data = options.data
  if (typeof data === 'string') {
    $.each(data.split('&'), function(index, value) {
      var pair = value.split('=')
      form.append($('<input>', {type: 'hidden', name: pair[0], value: pair[1]}))
    })
  } else if ($.isArray(data)) {
    $.each(data, function(index, value) {
      form.append($('<input>', {type: 'hidden', name: value.name, value: value.value}))
    })
  } else if (typeof data === 'object') {
    var key
    for (key in data)
      form.append($('<input>', {type: 'hidden', name: key, value: data[key]}))
  }

  $(document.body).append(form)
  form.submit()
}

// Internal: Abort an XmlHttpRequest if it hasn't been completed,
// also removing its event handlers.
function abortXHR(xhr) {
  if ( xhr && xhr.readyState < 4) {
    xhr.onreadystatechange = $.noop
    xhr.abort()
  }
}

// Internal: Generate unique id for state object.
//
// Use a timestamp instead of a counter since ids should still be
// unique across page loads.
//
// Returns Number.
function uniqueId() {
  return (new Date).getTime()
}

function cloneContents(container) {
  var cloned = container.clone()
  // Unmark script tags as already being eval'd so they can get executed again
  // when restored from cache. HAXX: Uses jQuery internal method.
  cloned.find('script').each(function(){
    if (!this.src) jQuery._data(this, 'globalEval', false)
  })
  return cloned.contents()
}

// Internal: Strips named query param from url
//
// url - String
//
// Returns String.
function stripParam(url, name) {
  return url
    .replace(new RegExp('[?&]' + name + '=[^&#]*'), '')
    .replace(/[?&]($|#)/, '\1')
    .replace(/[?&]/, '?')
}

function stripInternalParams(url) {
  url = stripParam(url, '_djax')
  url = stripParam(url, '_')
  return url
}

// Internal: Parse URL components and returns a Locationish object.
//
// url - String URL
//
// Returns HTMLAnchorElement that acts like Location.
function parseURL(url) {
  var a = document.createElement('a')
  $(a).data('href', url)
  return a
}

// Internal: Return the `href` component of given URL object with the hash
// portion removed.
//
// location - Location or HTMLAnchorElement
//
// Returns String
function stripHash(location) {
  return location.href.replace(/#.*/, '')
}

// Internal: Build options Object for arguments.
//
// For convenience the first parameter can be either the container or
// the options object.
//
// Examples
//
//   optionsFor('#container')
//   // => {container: '#container'}
//
//   optionsFor('#container', {push: true})
//   // => {container: '#container', push: true}
//
//   optionsFor({container: '#container', push: true})
//   // => {container: '#container', push: true}
//
// Returns options Object.
function optionsFor(container, options) {
  // Both container and options
  if ( container && options )
    options.container = container

  // First argument is options Object
  else if ( $.isPlainObject(container) )
    options = container

  // Only container
  else
    options = {container: container}

  // Find and validate container
  if (options.container)
    options.container = findContainerFor(options.container)

  return options
}

// Internal: Find container element for a variety of inputs.
//
// Because we can't persist elements using the history API, we must be
// able to find a String selector that will consistently find the Element.
//
// container - A selector String, jQuery object, or DOM Element.
//
// Returns a jQuery object whose context is `document` and has a selector.
function findContainerFor(container) {
  container = $(container)

  if ( !container.length ) {
    throw "no djax container for " + container.selector
  } else if ( container.selector !== '' && container.context === document ) {
    return container
  } else if ( container.attr('id') ) {
    return $('#' + container.attr('id'))
  } else {
    throw "cant get selector for djax container!"
  }
}

// Internal: Filter and find all elements matching the selector.
//
// Where $.fn.find only matches descendants, findAll will test all the
// top level elements in the jQuery object as well.
//
// elems    - jQuery object of Elements
// selector - String selector to match
//
// Returns a jQuery object.
function findAll(elems, selector) {
  return elems.filter(selector).add(elems.find(selector));
}

function parseHTML(html) {
  return $.parseHTML(html, document, true)
}

// Internal: Extracts container and metadata from response.
//
// 1. Extracts X-DJAX-URL header if set
// 2. Extracts inline <title> tags
// 3. Builds response Element and extracts fragment if set
//
// data    - String response data
// xhr     - XHR response
// options - djax options Object
//
// Returns an Object with url, title, and contents keys.
function extractContainer(data, xhr, options) {
  var obj = {}, fullDocument = /<html/i.test(data)

  // Prefer X-DJAX-URL header if it was set, otherwise fallback to
  // using the original requested url.
  var serverUrl = xhr.getResponseHeader('X-DJAX-URL')
  obj.url = serverUrl ? stripInternalParams(serverUrl) : options.requestUrl

  // Attempt to parse response html into elements
  if (fullDocument) {
    var $head = $(parseHTML(data.match(/<head[^>]*>([\s\S.]*)<\/head>/i)[0]))
    var $body = $(parseHTML(data.match(/<body[^>]*>([\s\S.]*)<\/body>/i)[0]))
  } else {
    var $head = $body = $(parseHTML(data))
  }

  // If response data is empty, return fast
  if ($body.length === 0)
    return obj

  // If there's a <title> tag in the header, use it as
  // the page's title.
  obj.title = findAll($head, 'title').last().text()

  if (options.fragment) {
    // If they specified a fragment, look for it in the response
    // and pull it out.
    if (options.fragment === 'body') {
      var $fragment = $body
    } else {
      var $fragment = findAll($body, options.fragment).first()
    }

    if ($fragment.length) {
      obj.contents = options.fragment === 'body' ? $fragment : $fragment.contents()

      // If there's no title, look for data-title and title attributes
      // on the fragment
      if (!obj.title)
        obj.title = $fragment.attr('title') || $fragment.data('title')
    }

  } else if (!fullDocument) {
    obj.contents = $body
  }

  // Clean up any <title> tags
  if (obj.contents) {
    // Remove any parent title elements
    obj.contents = obj.contents.not(function() { return $(this).is('title') })

    // Then scrub any titles from their descendants
    obj.contents.find('title').remove()

    // Gather all script[src] elements
    obj.scripts = findAll(obj.contents, 'script[src]').remove()
    obj.contents = obj.contents.not(obj.scripts)
  }

  // Trim any whitespace off the title
  if (obj.title) obj.title = $.trim(obj.title)

  return obj
}

// Load an execute scripts using standard script request.
//
// Avoids jQuery's traditional $.getScript which does a XHR request and
// globalEval.
//
// scripts - jQuery object of script Elements
//
// Returns nothing.
function executeScriptTags(scripts) {
  if (!scripts) return

  var existingScripts = $('script[src]')

  scripts.each(function() {
    var src = this.src
    var matchedScripts = existingScripts.filter(function() {
      return this.src === src
    })
    if (matchedScripts.length) return

    var script = document.createElement('script')
    var type = $(this).attr('type')
    if (type) script.type = type
    script.src = $(this).attr('src')
    document.head.appendChild(script)
  })
}

// Internal: History DOM caching class.
var cacheMapping      = {}
var cacheForwardStack = []
var cacheBackStack    = []

// Push previous state id and container contents into the history
// cache. Should be called in conjunction with `pushState` to save the
// previous container contents.
//
// id    - State ID Number
// value - DOM Element to cache
//
// Returns nothing.
function cachePush(id, value) {
  if(!djax.options.cache) {
    return;
  }
  cacheMapping[id] = value
  cacheBackStack.push(id)

  // Remove all entries in forward history stack after pushing a new page.
  trimCacheStack(cacheForwardStack, 0)

  // Trim back history stack to max cache length.
  trimCacheStack(cacheBackStack, djax.defaults.maxCacheLength)
}

// Shifts cache from directional history cache. Should be
// called on `popstate` with the previous state id and container
// contents.
//
// direction - "forward" or "back" String
// id        - State ID Number
// value     - DOM Element to cache
//
// Returns nothing.
function cachePop(direction, id, value) {
  if(!djax.options.cache) {
    return;
  }
  var pushStack, popStack
  cacheMapping[id] = value

  if (direction === 'forward') {
    pushStack = cacheBackStack
    popStack  = cacheForwardStack
  } else {
    pushStack = cacheForwardStack
    popStack  = cacheBackStack
  }

  pushStack.push(id)
  if (id = popStack.pop())
    delete cacheMapping[id]

  // Trim whichever stack we just pushed to to max cache length.
  trimCacheStack(pushStack, djax.defaults.maxCacheLength)
}

// Trim a cache stack (either cacheBackStack or cacheForwardStack) to be no
// longer than the specified length, deleting cached DOM elements as necessary.
//
// stack  - Array of state IDs
// length - Maximum length to trim to
//
// Returns nothing.
function trimCacheStack(stack, length) {
  while (stack.length > length)
    delete cacheMapping[stack.shift()]
}

// Public: Find version identifier for the initial page load.
//
// Returns String version or undefined.
function findVersion() {
  return $('meta').filter(function() {
    var name = $(this).attr('http-equiv')
    return name && name.toUpperCase() === 'X-DJAX-VERSION'
  }).attr('content')
}

// Install djax functions on $.djax to enable pushState behavior.
//
// Does nothing if already enabled.
//
// Examples
//
//     $.djax.enable()
//
// Returns nothing.
function enable() {
  $.fn.djax = fnDjax
  $.djax = djax
  $.djax.enable = $.noop
  $.djax.disable = disable
  $.djax.click = handleClick
  $.djax.submit = handleSubmit
  $.djax.reload = djaxReload
  $.djax.defaults = {
	history: true,
	cache: true,
    timeout: 650,
    push: true,
    replace: false,
    type: 'GET',
    dataType: 'html',
    scrollTo: 0,
    maxCacheLength: 20,
    version: findVersion
  }
  $(window).on('popstate.djax', onDjaxPopstate)
}

// Disable pushState behavior.
//
// This is the case when a browser doesn't support pushState. It is
// sometimes useful to disable pushState for debugging on a modern
// browser.
//
// Examples
//
//     $.djax.disable()
//
// Returns nothing.
function disable() {
  $.fn.djax = function() { return this }
  $.djax = fallbackDjax
  $.djax.enable = enable
  $.djax.disable = $.noop
  $.djax.click = $.noop
  $.djax.submit = $.noop
  $.djax.reload = function() { window.location.reload() }

  $(window).off('popstate.djax', onDjaxPopstate)
}


// Add the state property to jQuery's event object so we can use it in
// $(window).bind('popstate')
if ( $.inArray('state', $.event.props) < 0 )
  $.event.props.push('state')

// Is djax supported by this browser?
$.support.djax =
  window.history && window.history.pushState && window.history.replaceState &&
  // pushState isn't reliable on iOS until 5.
  !navigator.userAgent.match(/((iPod|iPhone|iPad).+\bOS\s+[1-4]\D|WebApps\/.+CFNetwork)/)

$.support.djax ? enable() : disable()

})(jQuery);