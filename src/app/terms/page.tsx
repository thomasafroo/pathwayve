import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Terms of Service | PathWayve",
  description: "Terms of Service for PathWayve.",
};

export default function TermsOfServicePage() {
  return (
    <main style={pageStyle}>
      <article style={articleStyle}>
        <p style={eyebrowStyle}>PathWayve</p>
        <h1 style={headingStyle}>Terms of Service</h1>
        <p style={updatedStyle}>Last updated: October 4, 2026</p>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Acceptance</h2>
          <p>
            By using PathWayve, you agree to these Terms of Service. If you do
            not agree, do not use the app.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Use of the App</h2>
          <p>
            PathWayve is provided to help with trip planning, route comparison,
            and scheduling support. You are responsible for reviewing plans,
            following local laws, and making safe travel decisions.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Accounts and Connected Services</h2>
          <p>
            Some features may require sign-in or connection to third-party
            services. You are responsible for the information you provide and
            for keeping any connected account access secure.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Service Availability</h2>
          <p>
            PathWayve may change, pause, or stop features at any time. Route,
            timing, map, weather, calendar, and AI-generated information may be
            incomplete or inaccurate.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Limitations</h2>
          <p>
            PathWayve is provided as is, without warranties of any kind. The app
            is not responsible for travel delays, missed events, unsafe
            conditions, or decisions made based on app output.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Contact</h2>
          <p>
            For questions about these Terms of Service, contact the PathWayve
            team.
          </p>
        </section>
      </article>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "var(--canvas)",
  color: "var(--ink)",
  padding: "64px 20px",
};

const articleStyle: CSSProperties = {
  maxWidth: "760px",
  margin: "0 auto",
  lineHeight: 1.7,
};

const eyebrowStyle: CSSProperties = {
  color: "var(--green)",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  marginBottom: "10px",
};

const headingStyle: CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: "44px",
  fontWeight: 400,
  lineHeight: 1.15,
  marginBottom: "10px",
};

const updatedStyle: CSSProperties = {
  color: "var(--muted)",
  marginBottom: "34px",
};

const sectionStyle: CSSProperties = {
  marginTop: "28px",
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  marginBottom: "8px",
};
