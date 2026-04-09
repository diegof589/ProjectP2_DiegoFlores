import type { Vec3 } from "./math3d";

export type ShadingMode = "flat" | "gouraud" | "phong";
export type DisplayMode = "shaded" | "normals" | "wireframe" | "shaded-wire";
export type LightType = "point" | "directional";
export type TextureMode = "uv" | "checker" | "stripes" | "uploaded";

export interface ObjectListItem {
  id: string;
  label: string;
  selected: boolean;
}

export interface SelectedObjectView {
  id: string;
  position: Vec3;
  rotation: Vec3;
  scale: number;
  colorHex: string;
  textureMode: TextureMode;
  sphericalUV: boolean;
  boundsLabel: string;
}

export interface PanelState {
  shadingMode: ShadingMode;
  displayMode: DisplayMode;
  lightType: LightType;
  lightEnabled: boolean;
  autoRotateLight: boolean;
  followCameraLight: boolean;
  lightColorHex: string;
  lightPosition: Vec3;
  ambient: number;
  diffuse: number;
  specular: number;
  shininess: number;
  lightIntensity: number;
  zoom: number;
  objects: ObjectListItem[];
  selectedObject: SelectedObjectView | null;
  statusText: string;
}

export interface PanelHandlers {
  onAddBuiltin: (kind: "teapot" | "beacon" | "cube" | "sphere") => void;
  onSelectObject: (id: string) => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onUploadOBJ: (file: File) => void;
  onUploadTexture: (file: File) => void;
  onShadingMode: (mode: ShadingMode) => void;
  onDisplayMode: (mode: DisplayMode) => void;
  onLightType: (type: LightType) => void;
  onLightEnabled: (enabled: boolean) => void;
  onAutoRotateLight: (enabled: boolean) => void;
  onLightColor: (value: string) => void;
  onFollowCameraLight: (enabled: boolean) => void;
  onLightingValue: (
    key:
      | "ambient"
      | "diffuse"
      | "specular"
      | "shininess"
      | "lightIntensity"
      | "zoom"
      | "lightX"
      | "lightY"
      | "lightZ",
    value: number,
  ) => void;
  onSelectedTransform: (key: "positionX" | "positionY" | "positionZ" | "rotationX" | "rotationY" | "rotationZ" | "scale", value: number) => void;
  onSelectedColor: (value: string) => void;
  onSelectedTextureMode: (mode: TextureMode) => void;
  onSelectedSphericalUV: (enabled: boolean) => void;
}

interface SliderBinding {
  input: HTMLInputElement;
  value: HTMLElement;
}

export function createControlPanel(handlers: PanelHandlers) {
  const panel = document.createElement("aside");
  panel.id = "gui";

  const panelInner = document.createElement("div");
  panelInner.className = "gui-panel";

  const title = document.createElement("div");
  title.className = "gui-title";
  title.textContent = "Lighting Assignment";

  const objInput = document.createElement("input");
  objInput.type = "file";
  objInput.accept = ".obj";
  objInput.hidden = true;
  objInput.addEventListener("change", () => {
    const file = objInput.files?.[0];
    if (file) {
      handlers.onUploadOBJ(file);
      objInput.value = "";
    }
  });

  const textureInput = document.createElement("input");
  textureInput.type = "file";
  textureInput.accept = "image/*";
  textureInput.hidden = true;
  textureInput.addEventListener("change", () => {
    const file = textureInput.files?.[0];
    if (file) {
      handlers.onUploadTexture(file);
      textureInput.value = "";
    }
  });

  const objectList = document.createElement("div");
  objectList.className = "object-list";

  const status = document.createElement("div");
  status.className = "status-card";

  const shadingButtons = makeChoiceGroup<ShadingMode>([
    ["flat", "Flat"],
    ["gouraud", "Gouraud"],
    ["phong", "Phong"],
  ], handlers.onShadingMode);

  const displayButtons = makeChoiceGroup<DisplayMode>([
    ["shaded", "Shaded"],
    ["shaded-wire", "Shaded + Wire"],
    ["wireframe", "Wireframe"],
    ["normals", "Normal Buffer"],
  ], handlers.onDisplayMode);

  const lightButtons = makeChoiceGroup<LightType>([
    ["point", "Point"],
    ["directional", "Directional"],
  ], handlers.onLightType);

  const sliders = {
    ambient: makeSlider("Ambient", 0, 1, 0.01),
    diffuse: makeSlider("Diffuse", 0, 2, 0.01),
    specular: makeSlider("Specular", 0, 2, 0.01),
    shininess: makeSlider("Shininess", 1, 128, 1),
    lightIntensity: makeSlider("Intensity", 0.2, 4, 0.05),
    lightX: makeSlider("Light X", -8, 8, 0.1),
    lightY: makeSlider("Light Y", -8, 8, 0.1),
    lightZ: makeSlider("Light Z", -8, 8, 0.1),
    zoom: makeSlider("Zoom", 0.8, 5, 0.01),
    positionX: makeSlider("Pos X", -4, 4, 0.01),
    positionY: makeSlider("Pos Y", -4, 4, 0.01),
    positionZ: makeSlider("Pos Z", -4, 4, 0.01),
    rotationX: makeSlider("Rot X", -180, 180, 1),
    rotationY: makeSlider("Rot Y", -180, 180, 1),
    rotationZ: makeSlider("Rot Z", -180, 180, 1),
    scale: makeSlider("Scale", 0.2, 3, 0.01),
  };

  for (const [key, binding] of Object.entries(sliders)) {
    binding.input.addEventListener("input", () => {
      const value = Number.parseFloat(binding.input.value);
      binding.value.textContent = formatNumber(value);
      if (
        key === "ambient" ||
        key === "diffuse" ||
        key === "specular" ||
        key === "shininess" ||
        key === "lightIntensity" ||
        key === "lightX" ||
        key === "lightY" ||
        key === "lightZ" ||
        key === "zoom"
      ) {
        handlers.onLightingValue(
          key as Parameters<PanelHandlers["onLightingValue"]>[0],
          value,
        );
      } else {
        handlers.onSelectedTransform(key as Parameters<PanelHandlers["onSelectedTransform"]>[0], value);
      }
    });
  }

  const lightEnabledCheckbox = document.createElement("input");
  lightEnabledCheckbox.type = "checkbox";
  lightEnabledCheckbox.addEventListener("change", () => {
    handlers.onLightEnabled(lightEnabledCheckbox.checked);
  });

  const followCameraCheckbox = document.createElement("input");
  followCameraCheckbox.type = "checkbox";
  followCameraCheckbox.addEventListener("change", () => {
    handlers.onFollowCameraLight(followCameraCheckbox.checked);
  });

  const autoRotateLightCheckbox = document.createElement("input");
  autoRotateLightCheckbox.type = "checkbox";
  autoRotateLightCheckbox.addEventListener("change", () => {
    handlers.onAutoRotateLight(autoRotateLightCheckbox.checked);
  });

  const lightColorInput = document.createElement("input");
  lightColorInput.type = "color";
  lightColorInput.addEventListener("input", () => {
    handlers.onLightColor(lightColorInput.value);
  });

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.addEventListener("input", () => {
    handlers.onSelectedColor(colorInput.value);
  });

  const textureSelect = document.createElement("select");
  textureSelect.innerHTML = `
    <option value="uv">UV Test</option>
    <option value="checker">Checker</option>
    <option value="stripes">Stripes</option>
    <option value="uploaded">Uploaded</option>
  `;
  textureSelect.addEventListener("change", () => {
    handlers.onSelectedTextureMode(textureSelect.value as TextureMode);
  });

  const sphericalCheckbox = document.createElement("input");
  sphericalCheckbox.type = "checkbox";
  sphericalCheckbox.addEventListener("change", () => {
    handlers.onSelectedSphericalUV(sphericalCheckbox.checked);
  });

  panelInner.append(
    title,
    objInput,
    textureInput,
    section("Scene", [
      buttonRow([
        makeButton("Add Cube", () => handlers.onAddBuiltin("cube")),
        makeButton("Add Sphere", () => handlers.onAddBuiltin("sphere")),
        makeButton("Add Teapot", () => handlers.onAddBuiltin("teapot")),
      ]),
      buttonRow([
        makeButton("Add Beacon", () => handlers.onAddBuiltin("beacon")),
        makeButton("Upload OBJ", () => objInput.click()),
        makeButton("Upload Texture", () => textureInput.click()),
      ]),
      buttonRow([
        makeButton("Deselect", handlers.onClearSelection),
      ]),
    ]),
    section("Objects", [
      objectList,
      buttonRow([
        makeButton("Delete Selected", handlers.onDeleteSelected),
      ]),
    ]),
    section("Shading", [
      shadingButtons.root,
      displayButtons.root,
    ]),
    section("Lighting", [
      lightButtons.root,
      checkboxRow("Light enabled", lightEnabledCheckbox),
      checkboxRow("Auto-rotate light", autoRotateLightCheckbox),
      checkboxRow("Light above camera", followCameraCheckbox),
      field("Light", lightColorInput),
      sliders.ambient.row,
      sliders.diffuse.row,
      sliders.specular.row,
      sliders.shininess.row,
      sliders.lightIntensity.row,
      sliders.lightX.row,
      sliders.lightY.row,
      sliders.lightZ.row,
      sliders.zoom.row,
    ]),
    section("Selected Object", [
      field("Color", colorInput),
      field("Texture", textureSelect),
      checkboxRow("Spherical UV", sphericalCheckbox),
      sliders.positionX.row,
      sliders.positionY.row,
      sliders.positionZ.row,
      sliders.rotationX.row,
      sliders.rotationY.row,
      sliders.rotationZ.row,
      sliders.scale.row,
      status,
    ]),
  );

  panel.append(panelInner);
  document.body.appendChild(panel);

  function update(state: PanelState) {
    shadingButtons.setValue(state.shadingMode);
    displayButtons.setValue(state.displayMode);
    lightButtons.setValue(state.lightType);
    lightEnabledCheckbox.checked = state.lightEnabled;
    autoRotateLightCheckbox.checked = state.autoRotateLight;
    followCameraCheckbox.checked = state.followCameraLight;
    lightColorInput.value = state.lightColorHex;

    setSlider(sliders.ambient, state.ambient);
    setSlider(sliders.diffuse, state.diffuse);
    setSlider(sliders.specular, state.specular);
    setSlider(sliders.shininess, state.shininess);
    setSlider(sliders.lightIntensity, state.lightIntensity);
    setSlider(sliders.lightX, state.lightPosition[0]);
    setSlider(sliders.lightY, state.lightPosition[1]);
    setSlider(sliders.lightZ, state.lightPosition[2]);
    setSlider(sliders.zoom, state.zoom);

    objectList.replaceChildren(...state.objects.map((item) => {
      const btn = document.createElement("button");
      btn.className = `object-chip${item.selected ? " active" : ""}`;
      btn.textContent = item.label;
      btn.addEventListener("click", () => handlers.onSelectObject(item.id));
      return btn;
    }));

    const selected = state.selectedObject;
    const enabled = selected !== null;
    for (const [key, binding] of Object.entries(sliders)) {
      if (key.startsWith("position") || key.startsWith("rotation") || key === "scale") {
        binding.input.disabled = !enabled;
      }
    }
    colorInput.disabled = !enabled;
    textureSelect.disabled = !enabled;
    sphericalCheckbox.disabled = !enabled;

    if (selected) {
      setSlider(sliders.positionX, selected.position[0]);
      setSlider(sliders.positionY, selected.position[1]);
      setSlider(sliders.positionZ, selected.position[2]);
      setSlider(sliders.rotationX, selected.rotation[0]);
      setSlider(sliders.rotationY, selected.rotation[1]);
      setSlider(sliders.rotationZ, selected.rotation[2]);
      setSlider(sliders.scale, selected.scale);
      colorInput.value = selected.colorHex;
      textureSelect.value = selected.textureMode;
      sphericalCheckbox.checked = selected.sphericalUV;
      status.textContent = `${selected.id}\n${selected.boundsLabel}`;
    } else {
      status.textContent = state.statusText;
    }
  }

  return { update };
}

function makeChoiceGroup<T extends string>(
  entries: Array<[T, string]>,
  onChange: (value: T) => void,
) {
  const root = document.createElement("div");
  root.className = "model-btns";
  const buttons = new Map<T, HTMLButtonElement>();

  for (const [value, label] of entries) {
    const button = document.createElement("button");
    button.className = "model-btn";
    button.textContent = label;
    button.addEventListener("click", () => onChange(value));
    buttons.set(value, button);
    root.appendChild(button);
  }

  return {
    root,
    setValue(value: T) {
      for (const [entry, button] of buttons) {
        button.classList.toggle("active", entry === value);
      }
    },
  };
}

function makeSlider(label: string, min: number, max: number, step: number): {
  row: HTMLElement;
  input: HTMLInputElement;
  value: HTMLElement;
} {
  const row = document.createElement("label");
  row.className = "slider-row";

  const text = document.createElement("span");
  text.className = "slider-label";
  text.textContent = label;

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);

  const value = document.createElement("span");
  value.className = "slider-val";

  row.append(text, input, value);
  return { row, input, value };
}

function setSlider(binding: SliderBinding, value: number) {
  binding.input.value = String(value);
  binding.value.textContent = formatNumber(value);
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "model-btn";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function section(title: string, children: HTMLElement[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "gui-section";

  const heading = document.createElement("div");
  heading.className = "gui-label";
  heading.textContent = title;

  wrapper.append(heading, ...children);
  return wrapper;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "color-row";
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function checkboxRow(label: string, input: HTMLInputElement): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "checkbox-row";
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(input, text);
  return wrapper;
}

function buttonRow(buttons: HTMLButtonElement[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "model-btns";
  row.append(...buttons);
  return row;
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}
