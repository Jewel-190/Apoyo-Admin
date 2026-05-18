import { X } from "lucide-react";

function QuickVerify({ application, onClose, onMarkInProgress }) {
  if (!application) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-3 md:p-6" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
      <div className="bg-[#ececec] rounded-3xl border border-gray-300 shadow-sm overflow-hidden max-w-[1180px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[390px_1fr] min-h-[680px]">
          <div className="p-5 md:p-6 bg-[#ececec] border-r border-gray-300">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full border-2 border-red-400 text-red-400 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            <h1 className="text-3xl md:text-4xl font-semibold text-cyan-600 mt-6">Quick Verify</h1>

            <div className="mt-7 space-y-2 text-sm md:text-base">
              <p>
                <span className="font-semibold">Date Applied:</span> February 6, 2026
              </p>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Status:</span>
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-purple-100 text-purple-500 leading-none">
                  Pending
                </span>
              </div>
            </div>

            <h2 className="text-2xl md:text-3xl font-semibold text-gray-700 mt-6">Details</h2>
            <div className="mt-3 space-y-2 text-sm md:text-[15px] text-gray-700">
              <div className="bg-gray-200 rounded-xl px-3 py-2.5">Type of Assistance: {application.category}</div>
              <p>Application ID: {application.id}</p>
              <div className="bg-gray-200 rounded-xl px-3 py-2.5">Name: {application.name}</div>
              <p>Birthday: July 25, 1990</p>
              <div className="bg-gray-200 rounded-xl px-3 py-2.5">Sex: Male</div>
              <p>Address: Langkaan 1, Dasmariñas Cavite</p>
              <div className="bg-gray-200 rounded-xl px-3 py-2.5">Contact No: 09122 334 555</div>
              <p>Email: josecruz@gmail.com</p>
            </div>

            <button
              onClick={onMarkInProgress}
              className="mt-9 w-full py-2.5 rounded-full bg-cyan-500 text-white font-semibold text-base md:text-lg hover:bg-cyan-600 transition"
            >
              Mark In Progress
            </button>
          </div>

          <div className="p-4 md:p-6 bg-[#ececec]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {application.documents.map((doc) => (
                <div key={doc.name} className="bg-white rounded-3xl overflow-hidden shadow-md">
                  <div className="h-44 md:h-48 bg-gray-50 flex items-center justify-center p-4">
                    <img src={doc.image} alt={doc.name} className="max-h-full object-contain" />
                  </div>
                  <div className="bg-lime-500 text-white px-4 py-2 text-sm md:text-base">{doc.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuickVerify;
