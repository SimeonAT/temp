import type { Metadata, Site, Socials } from "@types";

import { faGithub, faLinkedin } from '@fortawesome/free-brands-svg-icons';

export const baseUrl = "https://simeonat.github.io";

export const SITE: Site = {
  TITLE: "Simeon Tran",
  DESCRIPTION: "Computer Science Graduate Student",
  EMAIL: "",
  NUM_POSTS_ON_HOMEPAGE: 5,
  NUM_PROJECTS_ON_HOMEPAGE: 0,
};

export const HOME: Metadata = {
  TITLE: "Home",
  DESCRIPTION: "My personal website and blog.",
};

export const HOME: Metadata = {
  TITLE: "Home",
  DESCRIPTION: "Astro Micro is an accessible theme for Astro.",
};

export const BLOG: Metadata = {
  TITLE: "Blog",
  DESCRIPTION: "Blog posts on research projects that I am currently working on.",
};

export const PROJECTS: Metadata = {
  TITLE: "Projects",
  DESCRIPTION:
    "Projects that I am proud of.",
};

export const SOCIALS: Socials = [
  {
    NAME: "GitHub",
    HREF: "https://github.com/simeonat",
    icon: faGithub,
    end: false,
  },
  {
    NAME: "LinkedIn",
    HREF: "https://www.linkedin.com/in/simeon-tran/",
    icon: faLinkedin,
    end: true,
  }
];
