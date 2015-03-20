# webjpip.js
An end to end solution for Pure Web standard JPIP client.
This library contains a ready to use plugin for Leaflet and Cesium viewers, and can show a standard Jpeg2000 image published by a standard JPIP server. Progressive display of quality layers is supported.

The server side that this library assumes is a standard HTTP-JPIP server (except of a simple HTTP server for static file access, of course). The kdu_server comes with the Kakadu library is a good starting point, except some issues:
- The kdu_server is only a preview server. The main issue we've found is that after some clients it refuses creating a new channel and serves the clients statelessly. The webjpip.js throws a "Cannot extract cid" exception in such case.
- This server does not expose the CORS and "expose-headers" HTTP headers. If you have a license for the full Kakadu library which includes the source code, you can edit it very easily, otherwise Use proxy to overcome this limitation and add the headers.

The library implements features of JPIP and Jpeg2000 standards that we've found useful for us. For the Jpeg2000 files we have, the libarary is an end to end solution to view Jpeg2000 images on the viewer. The library uses the excellent Jpeg2000 decoder jpx.js which is part of the Mozilla/pdf.js repository (however, this is not the original jpx.js decoder as we had to add some features like decoding a small region in the image).

This library still doesn't have an official release and should be considered as alpha version. Notice that we have poor experience in web development, thus you may find a lot of issues related to web development. We also didn't create a minified version of the library and a full documentation.

Any help or recommendation are welcome.
