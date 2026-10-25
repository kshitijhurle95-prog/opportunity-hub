/**
 * Universal ATS & Opportunity Form Autofill Helper
 * Compatible with Greenhouse, Lever, Workday, Devpost, Unstop, Google Forms, and custom company portals.
 */

(function autoFillOpportunity(profile) {
  if (!profile) {
    profile = {
      fullName: "Jane Doe",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@example.com",
      phone: "+1-555-0199",
      linkedIn: "https://linkedin.com/in/janedoe",
      github: "https://github.com/janedoe",
      portfolio: "https://janedoe.dev",
      city: "San Francisco, CA",
      college: "Stanford University",
      degree: "Computer Science, B.S.",
      summary: "Aspiring software engineer and AI practitioner passionate about machine learning, distributed systems, and modern web applications."
    };
  }

  // Derive first & last if not present
  if (!profile.firstName && profile.fullName) {
    const parts = profile.fullName.trim().split(/\s+/);
    profile.firstName = parts[0] || "";
    profile.lastName = parts.slice(1).join(" ") || "";
  }

  let filledCount = 0;

  function triggerEvents(el, value) {
    el.focus();
    el.value = value;
    
    // React 16+ value tracker hack to ensure React registers change
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));

    // Highlight field
    el.style.outline = "2px solid #10b981";
    el.style.backgroundColor = "rgba(16, 185, 129, 0.08)";
    filledCount++;
  }

  const inputs = Array.from(document.querySelectorAll("input, textarea, select"));

  inputs.forEach(el => {
    if (el.type === "hidden" || el.type === "submit" || el.disabled) return;
    
    const name = (el.name || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const placeholder = (el.placeholder || "").toLowerCase();
    const label = el.labels && el.labels[0] ? el.labels[0].innerText.toLowerCase() : "";
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    const combined = `${name} ${id} ${placeholder} ${label} ${aria}`;

    // 1. Email
    if ((el.type === "email" || combined.includes("email")) && profile.email) {
      triggerEvents(el, profile.email);
    }
    // 2. Phone
    else if ((el.type === "tel" || combined.includes("phone") || combined.includes("mobile")) && profile.phone) {
      triggerEvents(el, profile.phone);
    }
    // 3. First Name
    else if ((combined.includes("first_name") || combined.includes("firstname") || combined.includes("first name") || combined.includes("fname")) && profile.firstName) {
      triggerEvents(el, profile.firstName);
    }
    // 4. Last Name
    else if ((combined.includes("last_name") || combined.includes("lastname") || combined.includes("last name") || combined.includes("lname")) && profile.lastName) {
      triggerEvents(el, profile.lastName);
    }
    // 5. Full Name
    else if ((combined.includes("full_name") || combined.includes("fullname") || combined.includes("your name") || name === "name" || id === "name") && profile.fullName) {
      triggerEvents(el, profile.fullName);
    }
    // 6. LinkedIn
    else if (combined.includes("linkedin") && profile.linkedIn) {
      triggerEvents(el, profile.linkedIn);
    }
    // 7. GitHub
    else if (combined.includes("github") && profile.github) {
      triggerEvents(el, profile.github);
    }
    // 8. Portfolio / Website
    else if ((combined.includes("portfolio") || combined.includes("website") || combined.includes("personal link") || combined.includes("homepage") || combined.includes("url")) && profile.portfolio) {
      triggerEvents(el, profile.portfolio);
    }
    // 9. Location / City
    else if ((combined.includes("city") || combined.includes("location") || combined.includes("address")) && profile.city) {
      triggerEvents(el, profile.city);
    }
    // 10. School / College
    else if ((combined.includes("school") || combined.includes("university") || combined.includes("college")) && profile.college) {
      triggerEvents(el, profile.college);
    }
    // 11. Degree
    else if ((combined.includes("degree") || combined.includes("major")) && profile.degree) {
      triggerEvents(el, profile.degree);
    }
    // 12. Cover Letter / Statement
    else if (el.tagName === "TEXTAREA" && (combined.includes("cover") || combined.includes("statement") || combined.includes("about") || combined.includes("why")) && profile.summary) {
      triggerEvents(el, profile.summary);
    }
  });

  // Display floating success toast in page
  const toast = document.createElement("div");
  toast.style.position = "fixed";
  toast.style.bottom = "24px";
  toast.style.right = "24px";
  toast.style.backgroundColor = "#0f172a";
  toast.style.color = "#ffffff";
  toast.style.padding = "16px 20px";
  toast.style.borderRadius = "12px";
  toast.style.boxShadow = "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)";
  toast.style.zIndex = "999999";
  toast.style.fontFamily = "system-ui, -apple-system, sans-serif";
  toast.style.fontSize = "14px";
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.gap = "12px";
  toast.style.border = "1px solid #10b981";

  toast.innerHTML = `
    <span style="display:inline-flex; width:28px; height:28px; background:#10b981; border-radius:50%; align-items:center; justify-content:center; color:#0f172a; font-weight:bold; font-size:16px;">✓</span>
    <div>
      <div style="font-weight:600; color:#34d399;">OpportunityHub Autofill</div>
      <div style="color:#cbd5e1; font-size:12px;">Successfully filled ${filledCount} fields automatically!</div>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);

  return { success: true, filledCount: filledCount };
})(window.__OPPORTUNITY_PROFILE__);
