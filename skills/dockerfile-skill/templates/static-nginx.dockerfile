FROM nginxinc/nginx-unprivileged:alpine

# Replace "." with a narrower build output directory when the project has one.
COPY --chown=101:101 . /usr/share/nginx/html

# If the project provides an Nginx server block, copy it here and expose the
# same listen port instead of keeping the default port.
# COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf

USER 101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
