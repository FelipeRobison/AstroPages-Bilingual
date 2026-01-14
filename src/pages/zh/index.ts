import type { APIRoute } from "astro";

/**
 * Redirect /zh and /zh/ to root /
 */

export const GET: APIRoute = ({ redirect }) => {
  return redirect("/", 301);
};

export const ALL: APIRoute = ({ redirect }) => {
  return redirect("/", 301);
};
