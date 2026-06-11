// Displays an opened image file (svg/png/jpg with no embedded source) in the
// preview pane, with the same zoom/pan controls as the rendered previews.

import ZoomPane from './ZoomPane.jsx';

export default function ImageView({ url, name }) {
  return (
    <section className="preview-pane">
      <ZoomPane resetKey={url}>
        <img className="preview-img" src={url} alt={name || 'Imported image'} draggable={false} />
      </ZoomPane>
    </section>
  );
}
