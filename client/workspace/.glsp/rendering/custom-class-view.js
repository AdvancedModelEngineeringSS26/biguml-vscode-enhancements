// Rendering plugin: renders Class nodes as blue circles.
// Loaded automatically by the editor from .glsp/rendering/*.js.
// Depends on window.glspAPI exposed by UmlStarter before bundle.js runs.
const { FeatureModule, overrideModelElement, svg, RectangularNodeView, GClassNode, injectable, CLASS_TYPE } = window.glspAPI;

class CustomClassView extends RectangularNodeView {
    render(element, context) {
        if (!this.isVisible(element, context)) return undefined;
        const w = Math.max(0, element.bounds.width);
        const h = Math.max(0, element.bounds.height);
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(cx, cy) * 2;
        return svg('g', { class: { selected: element.selected, mouseover: element.hoverFeedback } },
            svg('circle', { attrs: { cx, cy, r } }),
            context.renderChildren(element)
        );
    }
}
injectable()(CustomClassView);

window.__glspPlugins.push(new FeatureModule((bind, unbind, isBound, rebind) => {
    overrideModelElement({ bind, unbind, isBound, rebind }, CLASS_TYPE, GClassNode, CustomClassView);
}));
