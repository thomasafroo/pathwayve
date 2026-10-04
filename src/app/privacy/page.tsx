import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy | PathWayve",
  description: "Privacy policy for PathWayve.",
};

export default function PrivacyPolicyPage() {
  return (
    <main style={pageStyle}>
      <article style={articleStyle}>
        <p style={eyebrowStyle}>PathWayve</p>
        <h1 style={headingStyle}>Privacy Policy</h1>
        <p style={updatedStyle}>Last updated: October 4, 2026</p>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Overview</h2>
          <p>
            PathWayve helps users plan trips, compare route options, and organize
            stops. This Privacy Policy explains the basic types of information
            the app may use to provide those features.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Information We Use</h2>
          <p>
            The app may use trip details you enter, such as starting points,
            destinations, stops, timing preferences, and route constraints. If
            you choose to connect services such as calendar or location features,
            the app may use that information to support planning features.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>How Information Is Used</h2>
          <p>
            Information is used to generate trip plans, estimate travel times,
            show route context, improve the planning experience, and maintain
            app functionality.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Sharing</h2>
          <p>
            PathWayve does not sell personal information. Information may be
            sent to service providers only when needed to operate core features,
            such as maps, routing, calendar connection, or AI-assisted planning.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Data Choices</h2>
          <p>
            You can choose what information to enter into the app and whether to
            connect optional services. You may stop using connected features at
            any time.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionHeadingStyle}>Contact</h2>
          <p>
            For questions about this Privacy Policy, contact the PathWayve team.
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
