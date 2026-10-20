window.__ModuleLoader__.load({
	id: "pstack-dsh",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/roles.ts
		/**
		* pstack role keys used by playbooks and Settings → pstack.
		* These are pstack names, not Cursor slugs and not grok-build `subagent_type` values.
		*/
		const SCALAR_ROLES = [
			"feature",
			"refactoring",
			"bug-fix",
			"perf-issue",
			"hillclimb",
			"judgment-and-prose",
			"hardest-tasks",
			"how-explorer",
			"how-explainer",
			"why-investigators",
			"why-synthesizer",
			"reflect-tooling",
			"reflect-judgment",
			"swarm-workers",
			"independent-verifier",
			"poteto-agent",
			"comment-sicko"
		];
		const PANEL_ROLES = [
			"how-critics",
			"arena-runners",
			"arena-cross-judge-pool",
			"architect-runners",
			"interrogate-reviewers"
		];
		const ALL_ROLES = [...SCALAR_ROLES, ...PANEL_ROLES];
		function isPanelRole(value) {
			return PANEL_ROLES.includes(value);
		}
		function emptyOverlay() {
			const roles = {};
			for (const role of ALL_ROLES) roles[role] = {
				inherit: true,
				routes: []
			};
			return {
				version: 1,
				roles
			};
		}
		function routeKey(provider, model) {
			return `${provider}::${model}`;
		}
		//#endregion
		//#region src/settings-draft.ts
		function selectableRoutes(routes) {
			return routes.filter((route) => route.selectable);
		}
		function overlayToDraft(overlay) {
			return ALL_ROLES.map((role) => {
				const assignment = overlay.roles[role] ?? {
					inherit: true,
					routes: []
				};
				const inherit = assignment.inherit || assignment.routes.length === 0;
				return {
					role,
					panel: isPanelRole(role),
					inherit,
					inheritChoice: "inherit-parent",
					routes: inherit ? [] : assignment.routes.map((route) => ({ ...route }))
				};
			});
		}
		function draftToOverlay(drafts) {
			const overlay = emptyOverlay();
			for (const draft of drafts) {
				if (draft.inherit || draft.routes.length === 0) {
					overlay.roles[draft.role] = {
						inherit: true,
						routes: []
					};
					continue;
				}
				overlay.roles[draft.role] = {
					inherit: false,
					routes: draft.panel ? draft.routes.map((route) => ({ ...route })) : [draft.routes[0]]
				};
			}
			return overlay;
		}
		function liveFor(routes, provider, model) {
			return routes.find((route) => route.selectable && route.provider === provider && route.model === model);
		}
		function stripIllegalEffort(route, live) {
			const found = liveFor(live, route.provider, route.model);
			if (found === void 0) return {
				provider: route.provider,
				model: route.model
			};
			if (route.reasoningEffort === void 0) return {
				provider: route.provider,
				model: route.model
			};
			if (found.efforts.length === 0) return {
				provider: route.provider,
				model: route.model
			};
			if (!found.efforts.some((effort) => effort.id === route.reasoningEffort)) return {
				provider: route.provider,
				model: route.model
			};
			return {
				provider: route.provider,
				model: route.model,
				reasoningEffort: route.reasoningEffort
			};
		}
		function applyInheritAll(drafts, choice = "inherit-parent") {
			return drafts.map((draft) => draft.role === "how-critics" ? draft : {
				...draft,
				inherit: true,
				inheritChoice: choice,
				routes: []
			});
		}
		function applyRouteToAll(drafts, route, live) {
			const cleaned = stripIllegalEffort(route, live);
			if (liveFor(live, cleaned.provider, cleaned.model) === void 0) return drafts;
			return drafts.map((draft) => draft.role === "how-critics" ? draft : {
				...draft,
				inherit: false,
				inheritChoice: "inherit-parent",
				routes: draft.panel ? [{ ...cleaned }] : [{ ...cleaned }]
			});
		}
		function routeSelectValue(draft, index = 0) {
			if (draft.inherit || draft.routes.length === 0) return draft.inheritChoice;
			const route = draft.routes[index];
			if (route === void 0) return draft.inheritChoice;
			return routeKey(route.provider, route.model);
		}
		function parseRouteSelectValue(value, live) {
			if (value === "inherit-parent" || value === "auto") return {
				inherit: true,
				inheritChoice: value
			};
			const separator = value.indexOf("::");
			if (separator <= 0) return {
				inherit: true,
				inheritChoice: "inherit-parent"
			};
			const found = liveFor(live, value.slice(0, separator), value.slice(separator + 2));
			if (found === void 0) return {
				inherit: true,
				inheritChoice: "inherit-parent"
			};
			return {
				inherit: false,
				route: {
					provider: found.provider,
					model: found.model
				}
			};
		}
		//#endregion
		//#region src/ids.ts
		/** Settings nav id. Official slot `settings.section` (`packages/client/ui-settings/src/client/contract/slots.ts`). */
		const SETTINGS_SECTION_ID = "pstack";
		/** Same-origin Web routes. Pattern: dsh-oauth-login `src/auth-routes.ts`. */
		const SETTINGS_SNAPSHOT_PATH = "/plugins/pstack-dsh/settings";
		const SETTINGS_SAVE_PATH = "/plugins/pstack-dsh/settings";
		//#endregion
		//#region src/client/api.ts
		/** Use the same Host notifications as DSH's model directory, scoped to the open settings page. */
		function listenForCatalogChanges(ctx, listener) {
			const disposers = [
				ctx.remote.$on("llm/adapters-updated", listener),
				ctx.remote.$on("settings/document-updated", listener),
				ctx.remote.$on("credentials/reference-updated", listener),
				ctx.on("connection/reset", listener)
			];
			return () => {
				for (const dispose of disposers) dispose();
			};
		}
		async function jsonRequest(path, method, body, signal) {
			const response = await fetch(path, {
				method,
				headers: {
					accept: "application/json",
					...body === void 0 ? {} : { "content-type": "application/json" }
				},
				credentials: "same-origin",
				cache: "no-store",
				signal,
				...body === void 0 ? {} : { body: JSON.stringify(body) }
			});
			const value = await response.json().catch(() => void 0);
			if (!response.ok) {
				const message = typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : `HTTP ${response.status}`;
				throw new Error(message);
			}
			return value;
		}
		function loadSettingsSnapshot(signal) {
			return jsonRequest(SETTINGS_SNAPSHOT_PATH, "GET", void 0, signal);
		}
		function saveSettingsOverlay(overlay) {
			return jsonRequest(SETTINGS_SAVE_PATH, "PUT", { overlay });
		}
		//#endregion
		//#region src/client/poteto-defaults.ts
		const GROK = "grok-4.6-fast-xhigh";
		const SOL = "gpt-5.6-sol-max";
		const FABLE = "claude-fable-5-1-thinking-max";
		const PANEL = `${FABLE}, ${SOL}, ${GROK}, claude-opus-5-thinking-xhigh`;
		const POTETO_DEFAULT_SLUGS = {
			feature: GROK,
			refactoring: GROK,
			"bug-fix": FABLE,
			"perf-issue": FABLE,
			hillclimb: FABLE,
			"judgment-and-prose": FABLE,
			"hardest-tasks": FABLE,
			"how-explorer": GROK,
			"how-explainer": FABLE,
			"why-investigators": GROK,
			"why-synthesizer": FABLE,
			"reflect-tooling": SOL,
			"reflect-judgment": FABLE,
			"swarm-workers": GROK,
			"independent-verifier": "",
			"poteto-agent": "",
			"comment-sicko": "",
			"how-critics": "",
			"arena-runners": PANEL,
			"arena-cross-judge-pool": PANEL,
			"architect-runners": PANEL,
			"interrogate-reviewers": PANEL
		};
		function potetoNoteCopy(role, prefix) {
			const slugs = POTETO_DEFAULT_SLUGS[role];
			return slugs.length === 0 ? "" : `${prefix}${slugs}`;
		}
		//#endregion
		//#region src/client/PstackSettings.tsx
		/** Plugin-owned pstack page inside the official Settings shell. */
		const STYLE_ID = "pstack-dsh-settings-theme";
		const GROUPS = [
			{
				id: "groupPlaybooks",
				roles: [
					"feature",
					"refactoring",
					"bug-fix",
					"perf-issue",
					"hillclimb",
					"judgment-and-prose",
					"hardest-tasks"
				]
			},
			{
				id: "groupSkills",
				roles: [
					"how-explorer",
					"how-explainer",
					"why-investigators",
					"why-synthesizer",
					"reflect-tooling",
					"reflect-judgment",
					"swarm-workers"
				]
			},
			{
				id: "groupVerify",
				roles: [
					"independent-verifier",
					"poteto-agent",
					"comment-sicko"
				]
			},
			{
				id: "groupPanels",
				roles: PANEL_ROLES.filter((role) => role !== "how-critics")
			}
		];
		const SETTINGS_CSS = `
.pstack-page { display:flex; flex-direction:column; gap:12px; max-width:720px; color:var(--dsw-alias-label-primary); }
.pstack-title { margin:0; font-size:16px; line-height:24px; font-weight:500; color:var(--dsw-alias-label-primary); }
.pstack-intro { margin:0; font-size:14px; line-height:22px; color:var(--dsw-alias-label-tertiary); }
.pstack-note { margin:0; font-size:12px; line-height:18px; color:var(--dsw-alias-label-tertiary); }
.pstack-warn { margin:0; font-size:12px; line-height:18px; color:var(--dsw-alias-state-warn-label); }
.pstack-error { margin:0; font-size:13px; line-height:20px; color:var(--dsw-alias-state-error-primary); }
.pstack-ok { margin:0; font-size:12px; line-height:18px; color:var(--dsw-alias-state-success-primary); }
.pstack-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.pstack-group { margin:12px 0 0; display:flex; flex-direction:column; gap:8px; }
.pstack-group-title { margin:0; font-size:12px; line-height:18px; font-weight:500; color:var(--dsw-alias-label-secondary); }
.pstack-card {
  border:1px solid var(--dsw-alias-border-l2); border-radius:12px;
  padding:12px 14px; display:flex; flex-direction:column; gap:10px;
  background:var(--dsw-alias-bg-module-platform);
}
.pstack-card-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; }
.pstack-role { margin:0; font-size:13px; line-height:20px; font-weight:500; color:var(--dsw-alias-label-primary); font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.pstack-fields { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
.pstack-field { display:flex; flex-direction:column; gap:4px; min-width:180px; flex:1; }
.pstack-label { font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); }
.pstack-select {
  height:34px; padding:0 12px; border:1px solid var(--dsw-alias-border-l2); border-radius:8px;
  background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary);
  font:inherit; font-size:13px; line-height:20px;
}
.pstack-select:focus-visible { outline:none; border-color:var(--dsw-alias-brand-primary); }
.pstack-select:disabled { color:var(--dsw-alias-label-tertiary); cursor:default; }
.pstack-row { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
.pstack-path { margin:0; font-size:12px; line-height:18px; color:var(--dsw-alias-label-tertiary); word-break:break-all; }
`;
		function ensureThemeStyles() {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = SETTINGS_CSS;
			document.head.appendChild(style);
		}
		function overlaysEqual(left, right) {
			return JSON.stringify(left) === JSON.stringify(right);
		}
		function RoleHead({ role, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pstack-card-head",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "pstack-role",
					children: role
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "pstack-note",
					children: potetoNoteCopy(role, t("potetoPrefix"))
				})]
			});
		}
		function firstSelectable(routes) {
			const route = selectableRoutes(routes)[0];
			if (route === void 0) return void 0;
			return {
				provider: route.provider,
				model: route.model
			};
		}
		function EffortSelect({ id, route, live, t, onChange }) {
			const found = liveFor(live, route.provider, route.model);
			if (found === void 0 || found.efforts.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pstack-field",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
					className: "pstack-label",
					htmlFor: id,
					children: t("effort")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
					id,
					className: "pstack-select",
					value: route.reasoningEffort ?? "",
					onChange: (event) => {
						const idValue = event.target.value;
						onChange(idValue.length === 0 ? {
							provider: route.provider,
							model: route.model
						} : {
							provider: route.provider,
							model: route.model,
							reasoningEffort: idValue
						});
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: t("effortOmit")
						}),
						route.reasoningEffort !== void 0 && !found.efforts.some((effort) => effort.id === route.reasoningEffort) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
							value: route.reasoningEffort,
							disabled: true,
							children: [
								route.reasoningEffort,
								" · ",
								t("unavailable")
							]
						}) : null,
						found.efforts.map((effort) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: effort.id,
							children: effort.name || effort.id
						}, effort.id))
					]
				})]
			});
		}
		function RouteSelect({ id, value, live, t, disabled, onChange }) {
			const selectable = selectableRoutes(live);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
				id,
				className: "pstack-select",
				value,
				disabled,
				onChange: (event) => {
					onChange(event.target.value);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: "inherit-parent",
						children: t("inheritParent")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						value: "auto",
						children: t("auto")
					}),
					value !== "inherit-parent" && value !== "auto" && !selectable.some((route) => routeKey(route.provider, route.model) === value) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
						value,
						disabled: true,
						children: [
							value.replace("::", "/"),
							" · ",
							t("unavailable")
						]
					}) : null,
					selectable.map((route) => {
						const key = routeKey(route.provider, route.model);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
							value: key,
							children: [
								route.provider,
								"/",
								route.model
							]
						}, key);
					})
				]
			});
		}
		function PstackSettings({ t, subscribeCatalogChanges }) {
			if (t === void 0) throw new Error("pstack settings requires its translation function");
			const [drafts, setDrafts] = (0, react.useState)(void 0);
			const [saved, setSaved] = (0, react.useState)(void 0);
			const [live, setLive] = (0, react.useState)([]);
			const [path, setPath] = (0, react.useState)("");
			const [recommendOauth, setRecommendOauth] = (0, react.useState)(false);
			const [selectableCount, setSelectableCount] = (0, react.useState)(0);
			const [dropped, setDropped] = (0, react.useState)([]);
			const [error, setError] = (0, react.useState)(void 0);
			const [catalogError, setCatalogError] = (0, react.useState)(void 0);
			const [notice, setNotice] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const initialized = (0, react.useRef)(false);
			const catalogRequest = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				ensureThemeStyles();
			}, []);
			const refresh = (0, react.useCallback)(async () => {
				catalogRequest.current?.abort();
				const request = new AbortController();
				catalogRequest.current = request;
				try {
					const snapshot = await loadSettingsSnapshot(request.signal);
					if (request.signal.aborted) return;
					setLive(snapshot.catalog.routes);
					setSelectableCount(snapshot.catalog.selectableCount);
					setRecommendOauth(snapshot.catalog.recommendOauthLogin);
					setPath(snapshot.path);
					if (!initialized.current) {
						setSaved(snapshot.overlay);
						setDrafts(overlayToDraft(snapshot.overlay));
						setDropped(snapshot.droppedRoles);
						initialized.current = true;
					}
					setCatalogError(void 0);
				} catch (caught) {
					if (!request.signal.aborted) setCatalogError(caught instanceof Error ? caught.message : t("requestFailed"));
				}
			}, [t]);
			(0, react.useEffect)(() => {
				const reload = () => {
					refresh();
				};
				const visible = () => {
					if (document.visibilityState === "visible") reload();
				};
				const stop = subscribeCatalogChanges?.(reload);
				window.addEventListener("focus", reload);
				document.addEventListener("visibilitychange", visible);
				reload();
				return () => {
					stop?.();
					window.removeEventListener("focus", reload);
					document.removeEventListener("visibilitychange", visible);
					catalogRequest.current?.abort();
				};
			}, [refresh, subscribeCatalogChanges]);
			const currentOverlay = (0, react.useMemo)(() => drafts === void 0 ? void 0 : draftToOverlay(drafts), [drafts]);
			const dirty = saved !== void 0 && currentOverlay !== void 0 && !overlaysEqual(saved, currentOverlay);
			const empty = selectableCount === 0;
			const applyTargets = selectableRoutes(live);
			const patchRole = (role, update) => {
				setDrafts((current) => current?.map((draft) => draft.role === role ? update(draft) : draft));
				setNotice(void 0);
			};
			const setScalarChoice = (role, value) => {
				const parsed = parseRouteSelectValue(value, live);
				patchRole(role, (draft) => {
					if (parsed.inherit) return {
						...draft,
						inherit: true,
						inheritChoice: parsed.inheritChoice,
						routes: []
					};
					return {
						...draft,
						inherit: false,
						inheritChoice: "inherit-parent",
						routes: [stripIllegalEffort(parsed.route, live)]
					};
				});
			};
			const setPanelChoice = (role, index, value) => {
				const parsed = parseRouteSelectValue(value, live);
				patchRole(role, (draft) => {
					if (parsed.inherit) return {
						...draft,
						inherit: true,
						inheritChoice: parsed.inheritChoice,
						routes: []
					};
					const routes = draft.inherit ? [] : [...draft.routes];
					routes[index] = stripIllegalEffort(parsed.route, live);
					return {
						...draft,
						inherit: false,
						inheritChoice: "inherit-parent",
						routes
					};
				});
			};
			const save = async () => {
				if (currentOverlay === void 0) return;
				setBusy(true);
				setNotice(void 0);
				setError(void 0);
				try {
					const result = await saveSettingsOverlay(currentOverlay);
					setSaved(result.overlay);
					setDrafts(overlayToDraft(result.overlay));
					setDropped([]);
					setError(void 0);
					setNotice(t("saved"));
				} catch (caught) {
					setNotice(void 0);
					setError(caught instanceof Error ? caught.message : t("requestFailed"));
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "pstack-page",
				"aria-labelledby": "pstack-settings-title",
				onFocusCapture: (event) => {
					if (event.target instanceof HTMLSelectElement) refresh();
				},
				onPointerDownCapture: (event) => {
					if (event.target instanceof HTMLSelectElement) refresh();
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						id: "pstack-settings-title",
						className: "pstack-title",
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pstack-intro",
						children: t("intro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pstack-note",
						children: t("catalogUpdates")
					}),
					error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pstack-error",
						children: error
					}) : null,
					catalogError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pstack-error",
						children: catalogError
					}) : null,
					notice !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pstack-ok",
						role: "status",
						children: notice
					}) : null,
					dropped.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pstack-warn",
						children: t("dropped")
					}) : null,
					drafts === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pstack-note",
						children: t("loading")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						empty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "pstack-warn",
							children: t("emptyCatalog")
						}) : null,
						recommendOauth ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "pstack-note",
							children: t("oauthRecommend")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "pstack-toolbar",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									size: "sm",
									disabled: busy || !dirty,
									onClick: () => {
										save();
									},
									children: busy ? t("saving") : t("save")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									size: "sm",
									disabled: busy,
									onClick: () => {
										refresh();
									},
									children: t("reload")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "ghost",
									size: "sm",
									disabled: busy,
									onClick: () => {
										setDrafts((current) => current === void 0 ? current : applyInheritAll(current));
										setNotice(void 0);
									},
									children: t("resetAll")
								}),
								applyTargets.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "pstack-field",
									style: { minWidth: 220 },
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "pstack-label",
										children: t("applyAll")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: "pstack-select",
										defaultValue: "",
										disabled: busy,
										onChange: (event) => {
											const value = event.target.value;
											event.target.value = "";
											if (value.length === 0) return;
											if (value === "inherit-parent") {
												setDrafts((current) => current === void 0 ? current : applyInheritAll(current));
												return;
											}
											const parsed = parseRouteSelectValue(value, live);
											if (parsed.inherit) {
												setDrafts((current) => current === void 0 ? current : applyInheritAll(current, parsed.inheritChoice));
												return;
											}
											setDrafts((current) => current === void 0 ? current : applyRouteToAll(current, parsed.route, live));
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: t("applyAll")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "inherit-parent",
												children: t("applyAllInherit")
											}),
											applyTargets.map((route) => {
												const key = routeKey(route.provider, route.model);
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
													value: key,
													children: [
														route.provider,
														"/",
														route.model
													]
												}, key);
											})
										]
									})]
								}) : null
							]
						}),
						GROUPS.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "pstack-group",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: "pstack-group-title",
								children: t(group.id)
							}), group.roles.map((role) => {
								const draft = drafts.find((entry) => entry.role === role);
								if (draft === void 0) return null;
								if (!draft.panel) {
									const route = draft.routes[0];
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
										className: "pstack-card",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoleHead, {
											role,
											t
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "pstack-fields",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "pstack-field",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
													className: "pstack-label",
													htmlFor: `pstack-role-${role}`,
													children: role
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteSelect, {
													id: `pstack-role-${role}`,
													value: routeSelectValue(draft),
													live,
													t,
													disabled: busy,
													onChange: (value) => {
														setScalarChoice(role, value);
													}
												})]
											}), route !== void 0 && !draft.inherit ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EffortSelect, {
												id: `pstack-effort-${role}`,
												route,
												live,
												t,
												onChange: (next) => {
													patchRole(role, (current) => ({
														...current,
														routes: [next]
													}));
												}
											}) : null]
										})]
									}, role);
								}
								const rows = draft.inherit ? [] : draft.routes;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
									className: "pstack-card",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoleHead, {
											role,
											t
										}),
										draft.inherit ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "pstack-field",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: "pstack-label",
												htmlFor: `pstack-role-${role}`,
												children: t("inheritParent")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteSelect, {
												id: `pstack-role-${role}`,
												value: draft.inheritChoice,
												live: [],
												t,
												disabled: busy,
												onChange: (value) => {
													if (value === "inherit-parent" || value === "auto") patchRole(role, (current) => ({
														...current,
														inherit: true,
														inheritChoice: value,
														routes: []
													}));
												}
											})]
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											disabled: busy,
											onClick: () => {
												patchRole(role, (current) => ({
													...current,
													inherit: true,
													inheritChoice: "inherit-parent",
													routes: []
												}));
											},
											children: t("inheritParent")
										}),
										!draft.inherit ? rows.map((route, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "pstack-row",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "pstack-field",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
														className: "pstack-label",
														htmlFor: `pstack-panel-${role}-${index}`,
														children: `${role}[${index}]`
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RouteSelect, {
														id: `pstack-panel-${role}-${index}`,
														value: routeSelectValue({
															...draft,
															inherit: false,
															routes: [route]
														}),
														live,
														t,
														disabled: busy || empty,
														onChange: (value) => {
															setPanelChoice(role, index, value);
														}
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EffortSelect, {
													id: `pstack-panel-effort-${role}-${index}`,
													route,
													live,
													t,
													onChange: (next) => {
														patchRole(role, (current) => {
															const nextRoutes = [...current.routes];
															nextRoutes[index] = next;
															return {
																...current,
																inherit: false,
																routes: nextRoutes
															};
														});
													}
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "ghost",
													size: "sm",
													disabled: busy,
													onClick: () => {
														patchRole(role, (current) => {
															const nextRoutes = current.routes.filter((_, item) => item !== index);
															return nextRoutes.length === 0 ? {
																...current,
																inherit: true,
																routes: []
															} : {
																...current,
																inherit: false,
																routes: nextRoutes
															};
														});
													},
													children: t("removeRoute")
												})
											]
										}, `${role}-${index}`)) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "outline",
											size: "sm",
											disabled: busy || empty,
											onClick: () => {
												const added = firstSelectable(live);
												if (added === void 0) return;
												patchRole(role, (current) => ({
													...current,
													inherit: false,
													routes: [...current.inherit ? [] : current.routes, added]
												}));
											},
											children: t("addRoute")
										}) })
									]
								}, role);
							})]
						}, group.id)),
						path.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "pstack-path",
							children: [
								t("overlayPath"),
								": ",
								path
							]
						}) : null
					] })
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const en = {
			nav: "pstack roles",
			title: "pstack roles",
			intro: "Map each pstack role onto a route that is already logged in on this DSH. Children inherit this conversation until you save a mapping. Writes $DSH_HOME/pstack-dsh.json, the same file spawn reads.",
			loading: "Loading logged-in routes…",
			save: "Save",
			saving: "Saving…",
			saved: "Saved. New pstack_spawn calls pick this up.",
			reload: "Refresh models",
			catalogUpdates: "Model choices update automatically after login or model changes. Unsaved role settings are preserved.",
			unavailable: "currently unavailable",
			resetAll: "Inherit for every role",
			inheritParent: "inherit-parent",
			auto: "auto",
			potetoPrefix: "Poteto 0.15 recommendation: ",
			emptyCatalog: "No logged-in route. Every role inherits this conversation. Add a provider API key in Settings → Models.",
			oauthRecommend: "Subscription logins (ChatGPT, Claude, Grok, Copilot, OpenRouter, Kimi, Google Antigravity) show up here after you install and sign in with dsh-oauth-login or dsh-antigravity-oauth. Not required for API keys.",
			effort: "Effort",
			effortOmit: "omit (adapter default)",
			addRoute: "Add route",
			removeRoute: "Remove",
			applyAll: "Apply to every role",
			applyAllInherit: "Inherit parent for every role",
			overlayPath: "Overlay",
			dropped: "Some saved mappings pointed at routes that are no longer logged in. Those roles now inherit until you save again.",
			requestFailed: "The settings request failed.",
			groupPlaybooks: "Playbook delegates",
			groupSkills: "Skill roles",
			groupVerify: "Verify and helpers",
			groupPanels: "Panel roles"
		};
		const zh = {
			nav: "pstack 角色",
			title: "pstack 角色",
			intro: "把每个 pstack 角色映射到本机已经登录的路由。未保存前，子 agent 继承当前对话。写入 $DSH_HOME/pstack-dsh.json，与 spawn 读的是同一份文件。",
			loading: "正在加载已登录路由…",
			save: "保存",
			saving: "保存中…",
			saved: "已保存。之后的 pstack_spawn 会读到这份 overlay。",
			reload: "刷新模型列表",
			catalogUpdates: "登录或模型变更后自动更新列表，不会覆盖未保存的角色设置。",
			unavailable: "暂不可用",
			resetAll: "全部继承父对话",
			inheritParent: "inherit-parent",
			auto: "auto",
			potetoPrefix: "Poteto 0.15 推荐：",
			emptyCatalog: "没有已登录路由。每个角色都继承当前对话。请先在 设置 → 模型 里配置 API key。",
			oauthRecommend: "订阅登录（ChatGPT / Claude / Grok / Copilot / OpenRouter / Kimi / Google Antigravity）要出现在这里，需要另装并登录 dsh-oauth-login 或 dsh-antigravity-oauth。只用 API key 可以不装。",
			effort: "Effort",
			effortOmit: "省略（适配器默认）",
			addRoute: "添加路由",
			removeRoute: "移除",
			applyAll: "应用到全部角色",
			applyAllInherit: "全部角色继承父对话",
			overlayPath: "Overlay",
			dropped: "有些已保存的映射指向了不再登录的路由。这些角色已改回继承，保存后才会写盘。",
			requestFailed: "设置请求失败。",
			groupPlaybooks: "玩法委派",
			groupSkills: "技能角色",
			groupVerify: "核验与助手",
			groupPanels: "面板角色"
		};
		//#endregion
		//#region src/client/index.tsx
		const name = "pstack-dsh-client";
		const inject = [
			"slots",
			"locale",
			"remote"
		];
		function apply(ctx) {
			const namespace = "settings.pstack";
			ctx.effect(() => ctx.locale.register(namespace, {
				zh,
				en
			}), "pstack-dsh: settings copy");
			const t = ctx.locale.bind(namespace);
			const subscribeCatalogChanges = (listener) => listenForCatalogChanges(ctx, listener);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: SETTINGS_SECTION_ID,
				order: 16,
				label: () => t("nav"),
				inject: () => ({
					t,
					subscribeCatalogChanges
				})
			}, PstackSettings));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map