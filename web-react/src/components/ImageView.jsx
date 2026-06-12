// Displays an opened image file (svg/png/jpg with no embedded source) in the
// preview pane, with the same zoom/pan controls as the rendered previews. SVG is
// inlined (reliable sizing); png/jpg use an <img> with an object URL.

import ZoomPane from './ZoomPane.jsx';

export default function ImageView({ image, name }) {
  return (
    <section className="preview-pane">
      <ZoomPane resetKey={image.svg || image.url}>
        {image.svg ? (
          <div className="image-svg" dangerouslySetInnerHTML={{ __html: image.svg }} />
        ) : (
          <img className="preview-img" src={image.url} alt={name || 'Imported image'} draggable={false} />
        )}
      </ZoomPane>
    </section>
  );
}
