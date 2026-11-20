import PolicyLayout from '../components/policy/PolicyLayout';
export default function TermsPage(){
  return <PolicyLayout title="Terms and Conditions">
    <h2>1. What BantayLog is</h2>
    <p>BantayLog lets residents of Barangay Sta. Ana, Pateros report local concerns and follow the barangay's response. Barangay personnel use it to process reports, keep blotter records and share reviewed community updates.</p>
    <p><strong>BantayLog is not an emergency service.</strong> Reports are read when personnel are available. For emergencies, call 911 or contact the barangay hall directly.</p>
    <h2>2. Accounts</h2>
    <ul>
      <li>Public registration is for residents only. Staff, Secretary, Captain and Super Admin accounts are created by the barangay.</li>
      <li>Keep your password private. Do not share your account. Passwords must have 12 to 128 characters.</li>
      <li>Registering does not prove that you live in the barangay. Barangay personnel may separately verify your resident details. Editing your details later removes that verification until it is checked again.</li>
    </ul>
    <h2>3. Your responsibilities when reporting</h2>
    <ul>
      <li>Give truthful, accurate information. Do not file false reports or make accusations you know to be untrue.</li>
      <li>Include only the personal information about other people that is needed to describe the concern.</li>
      <li>Do not post insulting, threatening or obscene content.</li>
      <li>The barangay may decline to act on reports that are false, abusive or outside its responsibility.</li>
    </ul>
    <h2>4. Photos</h2>
    <ul>
      <li>You may attach up to three photos to a report (JPEG, PNG or WebP, up to 5 MB each).</li>
      <li>Upload only photos you took or have permission to share, and only photos relevant to the concern. Avoid showing faces, ID cards or house numbers when they are not needed.</li>
      <li>Photos are private. They are never published to the community feed.</li>
    </ul>
    <h2>5. Drafts, submission and cancellation</h2>
    <ul>
      <li>Drafts are private to you until you submit them.</li>
      <li>After submission, you may edit or cancel a report only while its status is still Submitted. Cancelled and resolved reports are kept and cannot be reopened. File a new report instead.</li>
      <li>A report moves through Submitted, Under Investigation, Scheduled for Action and Resolved. Remarks added by personnel are visible to you.</li>
    </ul>
    <h2>6. Community updates</h2>
    <p>Barangay personnel may write a separate public summary of a reported issue so residents can follow its progress. Your report text and photos are not copied automatically. See the Privacy Notice for how summaries are reviewed.</p>
    <h2>7. Changes to these terms</h2>
    <p>This is a draft. Once the barangay approves a version, its date will be shown at the top of this page.</p>
  </PolicyLayout>;
}
